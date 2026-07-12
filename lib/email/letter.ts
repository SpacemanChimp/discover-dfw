/* The Letter (TL-1) — tokens + the two subscribe-time emails. SERVER-ONLY.

   Double opt-in: the CONFIRMATION email is transactional (a direct
   response to the form submit) and exists to prove the address; the
   WELCOME email sends only after the confirm click and is the first
   marketing-class send, so it carries the CAN-SPAM footer (physical
   address) and a working unsubscribe from day one.

   Tokens are stateless HMAC like the digest unsubscribe layer, but
   SCOPE-PREFIXED so a letter token can never operate on a saved search
   (and vice versa): sig = HMAC(CRON_SECRET, `${scope}:${id}`). */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "@/lib/site";

export const LETTER_FROM = "The Letter · Discover DFW <letter@discoverdfw.com>";

/* CAN-SPAM physical address — user-provided 2026-07-12. */
export const LETTER_POSTAL_ADDRESS = "2201 Spinks Rd. #248, Flower Mound, Texas 75022";

type TokenScope = "letter-confirm" | "letter-unsub";

const key = () => process.env.CRON_SECRET || "";

export function signLetterToken(scope: TokenScope, subscriberId: string): string | null {
  const k = key();
  if (!k) return null;
  const sig = createHmac("sha256", k).update(`${scope}:${subscriberId}`).digest("base64url");
  return `${subscriberId}.${sig}`;
}

/** Returns the subscriber id when the signature checks out for THIS scope. */
export function verifyLetterToken(scope: TokenScope, token: string): string | null {
  const k = key();
  if (!k) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const id = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1));
  const expect = Buffer.from(createHmac("sha256", k).update(`${scope}:${id}`).digest("base64url"));
  try {
    return sig.length === expect.length && timingSafeEqual(sig, expect) ? id : null;
  } catch {
    return null;
  }
}

export const letterConfirmUrl = (id: string) => {
  const t = signLetterToken("letter-confirm", id);
  return t ? `${SITE_URL}/api/letter/confirm?token=${encodeURIComponent(t)}` : null;
};
export const letterUnsubscribeUrl = (id: string) => {
  const t = signLetterToken("letter-unsub", id);
  return t ? `${SITE_URL}/api/email/unsubscribe?token=${encodeURIComponent(t)}` : null;
};

/* ---- templates (field-guide palette, inline styles only) ------------------ */

const shell = (inner: string, footer: string) => `
  <div style="background:#F6F1E6;padding:28px 12px;font-family:Georgia,serif;">
    <div style="max-width:520px;margin:0 auto;">
      <div style="font-family:Menlo,Consolas,monospace;font-size:10px;font-weight:bold;letter-spacing:.26em;color:#D9481F;text-align:center;">DISCOVER DFW — THE LETTER</div>
      ${inner}
      <div style="font-family:Menlo,Consolas,monospace;font-size:9px;letter-spacing:.14em;color:rgba(29,25,19,.5);text-align:center;margin-top:16px;line-height:2;">
        ${footer}
      </div>
    </div>
  </div>`;

export function buildLetterConfirmationEmail(opts: { confirmUrl: string }): { subject: string; html: string } {
  const subject = "One click and you're on The Letter";
  const html = shell(
    `
      <h1 style="font-size:26px;font-weight:900;color:#1D1913;text-align:center;margin:10px 0 6px;">Confirm your spot.</h1>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EE;border:2px solid #1D1913;border-radius:16px;border-collapse:separate;overflow:hidden;">
        <tr><td style="padding:22px 24px;">
          <p style="font-size:15px;line-height:1.75;color:rgba(29,25,19,.82);margin:0;">
            You (or someone typing your address) asked for The Letter — one email each Sunday on
            North Texas real estate: what listed, what sold, and which city just changed its math.
            Click below and you're in. If this wasn't you, ignore this note and nothing ever sends again.
          </p>
          <div style="text-align:center;margin-top:20px;">
            <a href="${opts.confirmUrl}" style="display:inline-block;background:#D9481F;color:#F6F1E6;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;border-radius:999px;padding:13px 28px;">Confirm — put me on the list</a>
          </div>
        </td></tr>
      </table>`,
    `YOU RECEIVED THIS ONE-TIME NOTE BECAUSE THIS ADDRESS WAS ENTERED AT DISCOVERDFW.COM.<br/>
     NO CONFIRMATION, NO EMAILS — THAT'S THE WHOLE DEAL.<br/>
     DISCOVER DFW · ${LETTER_POSTAL_ADDRESS.toUpperCase()}`
  );
  return { subject, html };
}

export function buildLetterWelcomeEmail(opts: { unsubscribeUrl: string | null }): { subject: string; html: string } {
  const subject = "You're on The Letter — see you Sunday";
  const html = shell(
    `
      <h1 style="font-size:26px;font-weight:900;color:#1D1913;text-align:center;margin:10px 0 6px;">See you Sunday.</h1>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EE;border:2px solid #1D1913;border-radius:16px;border-collapse:separate;overflow:hidden;">
        <tr><td style="padding:22px 24px;">
          <p style="font-size:15px;line-height:1.75;color:rgba(29,25,19,.82);margin:0 0 14px;">
            Confirmed. Once a week — Sunday — you'll get the field guide's read on North Texas:
            what listed, what sold, which city just changed its math, and the occasional community
            worth a Saturday drive. No spam, no listings-blast, unsubscribe any time.
          </p>
          <p style="font-size:15px;line-height:1.75;color:rgba(29,25,19,.82);margin:0;">
            While you wait, two good places to wander:
          </p>
          <div style="text-align:center;margin-top:18px;">
            <a href="${SITE_URL}/homes" style="display:inline-block;background:#1D1913;color:#F6F1E6;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;text-decoration:none;border-radius:999px;padding:11px 22px;margin:4px;">Search every listing</a>
            <a href="${SITE_URL}/#cities" style="display:inline-block;background:#D9481F;color:#F6F1E6;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;text-decoration:none;border-radius:999px;padding:11px 22px;margin:4px;">Browse the city index</a>
          </div>
        </td></tr>
      </table>`,
    `YOU'RE GETTING THIS BECAUSE YOU CONFIRMED YOUR SUBSCRIPTION AT DISCOVERDFW.COM.<br/>
     ${opts.unsubscribeUrl ? `<a href="${opts.unsubscribeUrl}" style="color:rgba(29,25,19,.6);">UNSUBSCRIBE</a> ANY TIME — ONE CLICK, NO QUESTIONS.<br/>` : ""}
     DISCOVER DFW · ${LETTER_POSTAL_ADDRESS.toUpperCase()}`
  );
  return { subject, html };
}
