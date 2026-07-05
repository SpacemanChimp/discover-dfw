/* Transactional email via the Resend API. SERVER-ONLY — the API key must
   never reach the browser. Degrades to logging when RESEND_API_KEY is
   absent so environments without it never crash. */
import "server-only";

const FROM = "Discover DFW <alerts@discoverdfw.com>";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log("[email] RESEND_API_KEY not set — would send:", opts.subject, "→", opts.to);
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [opts.to], subject: opts.subject, html: opts.html }),
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
