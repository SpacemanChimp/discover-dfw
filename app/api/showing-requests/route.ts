import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { currentUserId, EMAIL_RE, looksLikeSpam, recordLeadEvent } from "@/lib/leads";
import { sendShowingRequestEmails } from "@/lib/email/lead-emails";
import { pushLeadToFub } from "@/lib/crm/fub";
import { chicagoTodayISO, validateRequestedDay, SHOWING_MAX_DAYS } from "@/lib/showing/dates";

/* Showing requests — a REQUEST, not a confirmed booking; a local guide
   confirms the exact time with the buyer and the listing agent. Guests submit
   with name/email; signed-in users get attached by session. Writes via the
   secret-key client (no anon RLS door). */

const TIME_WINDOWS = new Set(["Morning", "Midday", "Evening"]);
const MODES = new Set(["in_person", "live_video"]);
const DATE_SOURCES = new Set(["quick", "calendar"]);
const DATE_REASON: Record<string, string> = {
  malformed: "That date isn't valid",
  past: "Pick a date that hasn't passed",
  "out-of-range": `Pick a date within the next ${SHOWING_MAX_DAYS} days`,
};

interface Body {
  listingKey?: string;
  citySlug?: string;
  community?: string;
  address?: string;
  requestedDay?: string;
  timeWindow?: string;
  mode?: string;
  /** IANA timezone of the buyer's device, e.g. "America/Chicago". */
  timezone?: string;
  /** "quick" (one of the three chips) or "calendar" (the picker). */
  dateSource?: string;
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  sourcePage?: string;
  referrer?: string;
  sessionId?: string;
  hp?: string;
  openedAt?: number;
  /** Preview only: validate + echo the payload, write/send NOTHING. */
  dryRun?: boolean;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // bots get a quiet yes and nothing stored
  if (looksLikeSpam(body)) return NextResponse.json({ ok: true });

  const name = (body.name || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const day = (body.requestedDay || "").trim();
  // captured, never trusted for range math (server re-derives Chicago "today")
  const timezone = (body.timezone || "").trim().slice(0, 64) || null;
  const dateSource = DATE_SOURCES.has(body.dateSource || "") ? body.dateSource! : "quick";

  if (!body.listingKey) return NextResponse.json({ ok: false, error: "Missing listing" }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, error: "Add your name so the guide knows who's coming" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "That email doesn't look right" }, { status: 400 });
  // re-validate the date on the server against Chicago "today" — a tampered
  // past or far-future value is rejected even if the client was bypassed
  const dateCheck = validateRequestedDay(day, chicagoTodayISO());
  if (!dateCheck.ok)
    return NextResponse.json({ ok: false, error: DATE_REASON[dateCheck.reason] || "Pick a valid date" }, { status: 400 });
  if (!TIME_WINDOWS.has(body.timeWindow || ""))
    return NextResponse.json({ ok: false, error: "Pick a time of day" }, { status: 400 });
  if (!MODES.has(body.mode || ""))
    return NextResponse.json({ ok: false, error: "Pick in person or live video" }, { status: 400 });

  // dry-run: the payload we WOULD store/email/push, with nothing written or
  // sent. Lets production be verified without submitting a real showing.
  if (body.dryRun === true) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      wouldSubmit: {
        listingKey: body.listingKey,
        address: body.address ?? null,
        requestedDay: day,
        timeWindow: body.timeWindow,
        mode: body.mode,
        timezone,
        dateSource,
        name,
        email,
        phone: (body.phone || "").trim() || null,
        message: (body.message || "").trim().slice(0, 2000) || null,
        citySlug: (body.citySlug || "").trim() || null,
        community: (body.community || "").trim() || null,
        sourcePage: (body.sourcePage || "").slice(0, 300) || null,
        referrer: (body.referrer || "").slice(0, 300) || null,
        sessionId: (body.sessionId || "").trim() || null,
      },
    });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    // no secret key in this environment — keep the paper trail in the logs
    console.log("[showing-request]", JSON.stringify(body));
    return NextResponse.json({ ok: true });
  }

  const userId = await currentUserId();
  const row = {
    user_id: userId,
    listing_key: body.listingKey,
    requested_day: day,
    requested_time_window: body.timeWindow,
    showing_mode: body.mode,
    name,
    email,
    phone: (body.phone || "").trim() || null,
    message: (body.message || "").trim().slice(0, 2000) || null,
  };

  const { data: insertedShowing, error } = await admin.from("showing_requests").insert(row).select("id").single();
  if (error) {
    console.error("[showing-request] insert failed:", error.message, JSON.stringify(row));
    return NextResponse.json({ ok: false, error: "Couldn't save that — try once more" }, { status: 500 });
  }
  const showingId = (insertedShowing?.id as string) ?? null;

  await recordLeadEvent(admin, {
    userId,
    sessionId: (body.sessionId || "").trim() || null,
    eventType: "showing_request",
    listingKey: body.listingKey,
    citySlug: (body.citySlug || "").trim() || null,
    sourcePage: (body.sourcePage || "").slice(0, 300),
    metadata: { day, timeWindow: body.timeWindow, mode: body.mode, address: body.address ?? null, timezone, dateSource },
  });

  // row is stored — email failures can only cost the heads-up, never the lead
  await sendShowingRequestEmails(admin, {
    listingKey: body.listingKey,
    address: body.address || body.listingKey,
    requestedDay: day,
    timeWindow: body.timeWindow!,
    mode: body.mode as "in_person" | "live_video",
    name,
    email,
    phone: row.phone,
    message: row.message,
  });

  // CRM push last — the lead is already stored + emailed, so a Follow Up
  // Boss outage can only cost the sync, never the lead. Never throws.
  await pushLeadToFub(admin, {
    kind: "showing_request",
    name,
    email,
    phone: row.phone,
    message: row.message,
    listingKey: body.listingKey,
    address: (body.address || "").trim() || null,
    citySlug: (body.citySlug || "").trim() || null,
    community: (body.community || "").trim().slice(0, 120) || null,
    sourcePage: (body.sourcePage || "").slice(0, 300) || null,
    referrer: (body.referrer || "").slice(0, 300) || null,
    sessionId: (body.sessionId || "").trim() || null,
    userId,
    submittedAt: new Date().toISOString(),
    requestedDay: day,
    timeWindow: body.timeWindow,
    tourMode: body.mode,
    timezone,
    dateSource,
  });

  return NextResponse.json({ ok: true, ...(showingId ? { leadId: showingId } : {}) }); // id ties the client funnel event to this request
}
