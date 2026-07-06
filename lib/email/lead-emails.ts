/* Lead notification emails — the guide's heads-up and the submitter's
   confirmation, in the field-guide voice and palette (inline styles only;
   email clients). SERVER-ONLY.

   Ordering contract: the lead row is ALREADY stored before any of this
   runs, and nothing here throws — a dead mailbox never breaks the form.
   Every attempt is logged to lead_events (email_sent / email_failed) so
   "did the guide hear about this?" is answerable in SQL. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/site";
import { sendEmail } from "./resend";

/* ---- shared shell ---- */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function shell(eyebrow: string, headline: string, inner: string, footer: string): string {
  return `
  <div style="background:#F6F1E6;padding:28px 12px;font-family:Georgia,serif;">
    <div style="max-width:520px;margin:0 auto;">
      <div style="font-family:Menlo,Consolas,monospace;font-size:10px;font-weight:bold;letter-spacing:.26em;color:#D9481F;text-align:center;">${esc(eyebrow)}</div>
      <h1 style="font-size:26px;font-weight:900;color:#1D1913;text-align:center;margin:10px 0 18px;">${esc(headline)}</h1>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EE;border:2px solid #1D1913;border-radius:16px;border-collapse:separate;overflow:hidden;">
        ${inner}
      </table>
      <div style="font-family:Menlo,Consolas,monospace;font-size:9px;letter-spacing:.16em;color:rgba(29,25,19,.5);text-align:center;margin-top:16px;">
        ${esc(footer)}
      </div>
    </div>
  </div>`;
}

const row = (label: string, value: string) => `
  <tr>
    <td style="padding:12px 18px;border-bottom:1px solid rgba(29,25,19,.14);">
      <div style="font-family:Menlo,Consolas,monospace;font-size:10px;font-weight:bold;letter-spacing:.18em;color:#D9481F;">${esc(label)}</div>
      <div style="font-size:15px;color:#1D1913;margin-top:4px;">${esc(value)}</div>
    </td>
  </tr>`;

const button = (href: string, label: string) => `
  <tr>
    <td style="padding:16px 18px;text-align:center;">
      <a href="${href}" style="display:inline-block;background:#D9481F;color:#F6F1E6;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;border-radius:999px;padding:12px 26px;">${esc(label)}</a>
    </td>
  </tr>`;

const fmtDay = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/* ---- payloads ---- */

export interface ShowingEmailData {
  listingKey: string;
  address: string;
  requestedDay: string; // YYYY-MM-DD
  timeWindow: string;
  mode: "in_person" | "live_video";
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
}

export interface QuestionEmailData {
  listingKey: string;
  address: string;
  question: string;
  name: string;
  email: string;
  phone: string | null;
  replyPref: string | null;
}

/* ---- send + log ---- */

async function sendAndLog(
  admin: SupabaseClient,
  category: string,
  listingKey: string,
  mail: { to: string; subject: string; html: string; replyTo?: string }
): Promise<void> {
  const result = await sendEmail(mail).catch((e) => ({ ok: false as const, error: String(e) }));
  const { error } = await admin.from("lead_events").insert({
    event_type: result.ok ? "email_sent" : "email_failed",
    listing_key: listingKey,
    source_page: "server:lead-email",
    metadata: {
      category,
      to: mail.to,
      subject: mail.subject,
      dryRun: ("dryRun" in result && result.dryRun) || false,
      error: result.ok ? null : result.error ?? "unknown",
    },
  });
  if (error) console.error("[lead-email] log insert failed:", error.message);
  if (!result.ok) console.error(`[lead-email] ${category} send failed:`, result.error);
}

/** Fire the guide notification + submitter confirmation for a showing
    request. Never throws; call AFTER the row is stored. */
export async function sendShowingRequestEmails(admin: SupabaseClient, d: ShowingEmailData): Promise<void> {
  const when = `${fmtDay(d.requestedDay)}, ${d.timeWindow.toLowerCase()}`;
  const how = d.mode === "live_video" ? "Live video" : "In person";
  const notifyTo = process.env.LEAD_NOTIFY_EMAIL;

  if (notifyTo) {
    await sendAndLog(admin, "guide_showing_request", d.listingKey, {
      to: notifyTo,
      replyTo: d.email, // hit reply, reach the lead
      subject: `Showing request — ${d.address}`,
      html: shell(
        "DISCOVER DFW — NEW LEAD",
        "Showing request.",
        [
          row("WHO", `${d.name} · ${d.email}${d.phone ? ` · ${d.phone}` : ""}`),
          row("HOME", d.address),
          row("WHEN", `${when} — ${how}`),
          d.message ? row("NOTE", d.message) : "",
          button(`${SITE_URL}/listing/${d.listingKey}`, "Open the listing"),
        ].join(""),
        "REPLY GOES STRAIGHT TO THE LEAD · STATUS IS 'NEW' IN SHOWING_REQUESTS"
      ),
    });
  }

  await sendAndLog(admin, "user_showing_confirmation", d.listingKey, {
    to: d.email,
    subject: `Your showing request is in — ${d.address}`,
    html: shell(
      "DISCOVER DFW — REQUEST RECEIVED",
      "Consider it requested.",
      [
        row("HOME", d.address),
        row("WHEN", `${when} — ${how}`),
        `<tr><td style="padding:14px 18px;border-bottom:1px solid rgba(29,25,19,.14);font-size:14.5px;line-height:1.65;color:rgba(29,25,19,.8);">
          A local guide will confirm — a real person who knows the street, never a call center.
          If the window doesn't work, they'll offer the next one that does.
        </td></tr>`,
        button(`${SITE_URL}/listing/${d.listingKey}`, "Revisit the listing"),
      ].join(""),
      "ONE-TIME NOTE — YOU REQUESTED THIS SHOWING AT DISCOVERDFW.COM"
    ),
  });
}

/** Fire the guide notification + submitter confirmation for a listing
    question. Never throws; call AFTER the row is stored. */
export async function sendListingQuestionEmails(admin: SupabaseClient, d: QuestionEmailData): Promise<void> {
  const notifyTo = process.env.LEAD_NOTIFY_EMAIL;

  if (notifyTo) {
    await sendAndLog(admin, "guide_listing_question", d.listingKey, {
      to: notifyTo,
      replyTo: d.email,
      subject: `Question — ${d.address}`,
      html: shell(
        "DISCOVER DFW — NEW LEAD",
        "Someone's asking.",
        [
          row("WHO", `${d.name} · ${d.email}${d.phone ? ` · ${d.phone}` : ""}${d.replyPref ? ` · prefers ${d.replyPref}` : ""}`),
          row("HOME", d.address),
          row("QUESTION", d.question),
          button(`${SITE_URL}/listing/${d.listingKey}`, "Open the listing"),
        ].join(""),
        "REPLY GOES STRAIGHT TO THE LEAD · STATUS IS 'NEW' IN LISTING_QUESTIONS"
      ),
    });
  }

  await sendAndLog(admin, "user_question_confirmation", d.listingKey, {
    to: d.email,
    subject: `Your question is with your guide — ${d.address}`,
    html: shell(
      "DISCOVER DFW — SENT TO YOUR GUIDE",
      "Good question.",
      [
        row("HOME", d.address),
        row("YOU ASKED", d.question),
        `<tr><td style="padding:14px 18px;border-bottom:1px solid rgba(29,25,19,.14);font-size:14.5px;line-height:1.65;color:rgba(29,25,19,.8);">
          It went to one local guide — not a lead list. Expect a ${d.replyPref === "text" ? "text" : "reply"} back,
          usually inside ten minutes during the day.
        </td></tr>`,
        button(`${SITE_URL}/listing/${d.listingKey}`, "Revisit the listing"),
      ].join(""),
      "ONE-TIME NOTE — YOU ASKED THIS AT DISCOVERDFW.COM"
    ),
  });
}
