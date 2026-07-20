/* Transactional email via the Resend API. SERVER-ONLY — the API key must
   never reach the browser.

   Send gating (dev-safe by design):
   - no RESEND_API_KEY            → log, return {ok:false}
   - NODE_ENV !== "production"    → DRY RUN: log the payload, return
     {ok:true, dryRun:true} — local testing never emails real people.
     Set EMAIL_SEND_IN_DEV=1 to deliberately send from dev. */
import "server-only";

const FROM = "Discover DFW <alerts@discoverdfw.com>";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  /** plain-text alternative (multipart) — deliverability + accessibility */
  text?: string;
  /** Reply-To — set to the lead's address on internal notifications. */
  replyTo?: string;
  /** Extra SMTP headers — e.g. List-Unsubscribe on recurring digests. */
  headers?: Record<string, string>;
  /** Sender override — e.g. The Letter's letter@ (defaults to alerts@).
      Same verified domain; local-part-only changes need no new DNS. */
  from?: string;
}): Promise<{ ok: boolean; error?: string; dryRun?: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log("[email] RESEND_API_KEY not set — would send:", opts.subject, "→", opts.to);
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  if (process.env.NODE_ENV !== "production" && process.env.EMAIL_SEND_IN_DEV !== "1") {
    console.log("[email] DRY RUN (dev):", opts.subject, "→", opts.to);
    return { ok: true, dryRun: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: opts.from ?? FROM,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
        ...(opts.replyTo ? { reply_to: [opts.replyTo] } : {}),
        ...(opts.headers ? { headers: opts.headers } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[email] resend error:", res.status, body.slice(0, 300));
      return { ok: false, error: `Resend ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[email] send failed:", e);
    return { ok: false, error: "network" };
  }
}
