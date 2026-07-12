import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { sendEmail } from "@/lib/email/resend";
import { EMAIL_RE, looksLikeSpam } from "@/lib/leads";
import { buildLetterConfirmationEmail, letterConfirmUrl, LETTER_FROM } from "@/lib/email/letter";

/* The Letter — subscribe (TL-1, double opt-in). PUBLIC endpoint behind the
   same cheap spam guard as the lead forms (honeypot + 3s dwell; bots get a
   fake ok and we store nothing). A submit NEVER subscribes anyone: it
   creates/refreshes a 'pending' row and sends the CONFIRMATION email —
   only the signed confirm link subscribes. Re-submits inside the
   10-minute window don't re-send (mailbox-flood guard); an unsubscribed
   address that submits again re-enters the pending flow (re-opt-in).

   Production sends are gated by deliverability plumbing being real:
   lib/email/resend.ts dry-runs outside production, and the first
   production send is a separately-approved supervised test. */

export const runtime = "nodejs";

const RESEND_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  let body: { email?: string; hp?: string; openedAt?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON body" }, { status: 400 });
  }

  // bots get a fake yes and we store nothing (lead-form pattern)
  if (looksLikeSpam({ hp: body.hp, openedAt: body.openedAt })) {
    return NextResponse.json({ ok: true, state: "confirm_sent" });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ ok: false, error: "That email doesn't look right" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });

  const { data: existing, error: readErr } = await db
    .from("letter_subscribers")
    .select("id, status, confirm_sent_at")
    .eq("email", email)
    .maybeSingle();
  if (readErr) {
    const missing = /relation .* does not exist|schema cache/i.test(readErr.message);
    return NextResponse.json(
      { ok: false, error: missing ? "The Letter isn't taking signups yet — try again soon" : "Something hiccuped — try again" },
      { status: 503 }
    );
  }

  if (existing?.status === "subscribed") {
    // no email: nothing to confirm, and saying so avoids enumeration noise
    return NextResponse.json({ ok: true, state: "already" });
  }

  let subscriberId = existing?.id ?? null;
  if (existing) {
    if (
      existing.status === "pending" &&
      existing.confirm_sent_at &&
      Date.now() - new Date(existing.confirm_sent_at).getTime() < RESEND_WINDOW_MS
    ) {
      // recently sent — don't flood the mailbox
      return NextResponse.json({ ok: true, state: "confirm_sent" });
    }
    const { error } = await db
      .from("letter_subscribers")
      .update({ status: "pending" }) // re-opt-in path for 'unsubscribed'
      .eq("id", existing.id);
    if (error) return NextResponse.json({ ok: false, error: "Something hiccuped — try again" }, { status: 500 });
  } else {
    const { data: created, error } = await db
      .from("letter_subscribers")
      .insert({ email, status: "pending", source: "homepage" })
      .select("id")
      .single();
    if (error) return NextResponse.json({ ok: false, error: "Something hiccuped — try again" }, { status: 500 });
    subscriberId = created.id;
  }

  const confirmUrl = letterConfirmUrl(subscriberId!);
  if (!confirmUrl) {
    // CRON_SECRET missing — never strand a pending row that can't confirm
    return NextResponse.json({ ok: false, error: "Signups are paused — try again soon" }, { status: 503 });
  }
  const { subject, html } = buildLetterConfirmationEmail({ confirmUrl });
  const sent = await sendEmail({ to: email, subject, html, from: LETTER_FROM });
  if (!sent.ok) {
    return NextResponse.json({ ok: false, error: "Couldn't send the confirmation — try again soon" }, { status: 502 });
  }
  await db.from("letter_subscribers").update({ confirm_sent_at: new Date().toISOString() }).eq("id", subscriberId!);

  return NextResponse.json({ ok: true, state: "confirm_sent", dryRun: sent.dryRun ?? false });
}
