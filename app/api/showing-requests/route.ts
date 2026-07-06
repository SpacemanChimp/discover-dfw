import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { currentUserId, EMAIL_RE, looksLikeSpam, notifyGuide, recordLeadEvent } from "@/lib/leads";

/* Showing requests — a REQUEST, not a confirmed booking; a local guide
   confirms. Guests submit with name/email; signed-in users get attached
   by session. Writes via the secret-key client (no anon RLS door). */

const TIME_WINDOWS = new Set(["Morning", "Midday", "Evening"]);
const MODES = new Set(["in_person", "live_video"]);

interface Body {
  listingKey?: string;
  citySlug?: string;
  address?: string;
  requestedDay?: string;
  timeWindow?: string;
  mode?: string;
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  sourcePage?: string;
  sessionId?: string;
  hp?: string;
  openedAt?: number;
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

  if (!body.listingKey) return NextResponse.json({ ok: false, error: "Missing listing" }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, error: "Add your name so the guide knows who's coming" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "That email doesn't look right" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)))
    return NextResponse.json({ ok: false, error: "Pick a day" }, { status: 400 });
  const daysOut = (Date.parse(day) - Date.now()) / 86_400_000;
  if (daysOut < -1 || daysOut > 30)
    return NextResponse.json({ ok: false, error: "Pick a day in the next few weeks" }, { status: 400 });
  if (!TIME_WINDOWS.has(body.timeWindow || ""))
    return NextResponse.json({ ok: false, error: "Pick a time of day" }, { status: 400 });
  if (!MODES.has(body.mode || ""))
    return NextResponse.json({ ok: false, error: "Pick in person or live video" }, { status: 400 });

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

  const { error } = await admin.from("showing_requests").insert(row);
  if (error) {
    console.error("[showing-request] insert failed:", error.message, JSON.stringify(row));
    return NextResponse.json({ ok: false, error: "Couldn't save that — try once more" }, { status: 500 });
  }

  await recordLeadEvent(admin, {
    userId,
    sessionId: (body.sessionId || "").trim() || null,
    eventType: "showing_request",
    listingKey: body.listingKey,
    citySlug: (body.citySlug || "").trim() || null,
    sourcePage: (body.sourcePage || "").slice(0, 300),
    metadata: { day, timeWindow: body.timeWindow, mode: body.mode, address: body.address ?? null },
  });

  await notifyGuide(`Showing request — ${body.address || body.listingKey}`, [
    `<b>${name}</b> asked to see <b>${body.address || body.listingKey}</b>.`,
    `${day}, ${body.timeWindow} — ${body.mode === "live_video" ? "live video" : "in person"}.`,
    `Reply to: ${email}${row.phone ? ` · ${row.phone}` : ""}`,
    row.message ? `Note: ${row.message}` : "",
  ].filter(Boolean));

  return NextResponse.json({ ok: true });
}
