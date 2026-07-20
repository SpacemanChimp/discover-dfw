import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { sendEmail } from "@/lib/email/resend";
import { SITE_URL } from "@/lib/site";
import {
  buildLetterWelcomeEmail,
  letterUnsubscribeUrl,
  verifyLetterToken,
  LETTER_FROM,
} from "@/lib/email/letter";

/* The Letter — confirm (TL-1, the double-opt-in click). The HMAC token IS
   the authorization: verify → flip pending/unsubscribed → subscribed →
   send the WELCOME email (the first marketing-class send, so it carries
   the CAN-SPAM postal footer, an unsubscribe link, and RFC 8058 one-click
   headers). Idempotent: clicking twice lands on a friendly "already on
   the list" page and never double-sends the welcome. */

export const runtime = "nodejs";

const page = (headline: string, body: string) => `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<meta name="robots" content="noindex,nofollow"/><title>${headline} — Discover DFW</title></head>
<body style="margin:0;background:#F6F1E6;font-family:Georgia,serif;color:#1D1913;">
  <div style="max-width:460px;margin:0 auto;padding:80px 20px;text-align:center;">
    <div style="font-family:Menlo,Consolas,monospace;font-size:10px;font-weight:bold;letter-spacing:.26em;color:#D9481F;">DISCOVER DFW — THE LETTER</div>
    <h1 style="font-size:30px;font-weight:900;margin:14px 0 10px;">${headline}</h1>
    <p style="font-size:15px;line-height:1.7;color:rgba(29,25,19,.75);margin:0;">${body}</p>
    <a href="${SITE_URL}/" style="display:inline-block;background:#D9481F;color:#F6F1E6;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;border-radius:999px;padding:13px 26px;margin-top:26px;">Back to the field guide</a>
  </div>
</body></html>`;

const html = (body: string, status: number) =>
  new NextResponse(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const subscriberId = verifyLetterToken("letter-confirm", token);
  if (!subscriberId)
    return html(page("That link didn't take.", "It may be malformed or truncated by your mail client. Head back to the site and sign up again — the next link will work."), 400);

  const db = getSupabaseAdmin();
  if (!db) return html(page("Signups are paused.", "Try the link again in a little while."), 503);

  const { data: sub, error } = await db
    .from("letter_subscribers")
    .select("id, email, status")
    .eq("id", subscriberId)
    .maybeSingle();
  if (error || !sub)
    return html(page("That link didn't take.", "We couldn't find that signup. Head back to the site and enter your email again."), 400);

  if (sub.status === "subscribed")
    return html(page("Already on the list.", "You're confirmed — The Letter lands on Sundays. Nothing else to do."), 200);

  const { error: updErr } = await db
    .from("letter_subscribers")
    .update({ status: "subscribed", confirmed_at: new Date().toISOString(), unsubscribed_at: null })
    .eq("id", sub.id);
  if (updErr) return html(page("Something hiccuped.", "Give the link another try in a minute."), 500);

  // first-party funnel: the confirmed opt-in is the conversion (server-side
  // — the click arrives from an email, so there is no browser session).
  // Fire-and-forget: analytics failures never affect the subscriber.
  try {
    await db.from("site_events").upsert(
      { event_id: crypto.randomUUID(), event: "letter_subscribed", session_id: ("srv-" + sub.id).slice(0, 36), path: "/letter/confirm", page_type: "letter", intent: "newsletter", lead_id: null },
      { onConflict: "event_id", ignoreDuplicates: true }
    );
  } catch { /* never blocks the confirmation */ }

  // welcome — marketing-class from send #1: postal footer + unsubscribe +
  // RFC 8058 one-click headers
  const unsubUrl = letterUnsubscribeUrl(sub.id);
  const { subject, html: welcomeHtml } = buildLetterWelcomeEmail({ unsubscribeUrl: unsubUrl });
  await sendEmail({
    to: sub.email,
    subject,
    html: welcomeHtml,
    from: LETTER_FROM,
    headers: unsubUrl
      ? { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : undefined,
  });

  return html(page("You're on the list.", "The Letter lands on Sundays — one email, no spam, unsubscribe any time. A welcome note is on its way to your inbox."), 200);
}
