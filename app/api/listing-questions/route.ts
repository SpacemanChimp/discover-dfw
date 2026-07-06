import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { currentUserId, EMAIL_RE, looksLikeSpam, notifyGuide, recordLeadEvent } from "@/lib/leads";

/* Listing questions — routed to one local guide, never a lead list.
   Guests submit with name/email; signed-in users get attached by session. */

interface Body {
  listingKey?: string;
  citySlug?: string;
  address?: string;
  question?: string;
  name?: string;
  email?: string;
  phone?: string;
  replyPref?: string;
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

  if (looksLikeSpam(body)) return NextResponse.json({ ok: true });

  const name = (body.name || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const question = (body.question || "").trim().slice(0, 2000);

  if (!body.listingKey) return NextResponse.json({ ok: false, error: "Missing listing" }, { status: 400 });
  if (!question) return NextResponse.json({ ok: false, error: "Ask something first — anything" }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, error: "Add your name so the guide knows who's asking" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "That email doesn't look right" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) {
    console.log("[listing-question]", JSON.stringify(body));
    return NextResponse.json({ ok: true });
  }

  const userId = await currentUserId();
  const row = {
    user_id: userId,
    listing_key: body.listingKey,
    question,
    name,
    email,
    phone: (body.phone || "").trim() || null,
  };

  const { error } = await admin.from("listing_questions").insert(row);
  if (error) {
    console.error("[listing-question] insert failed:", error.message, JSON.stringify(row));
    return NextResponse.json({ ok: false, error: "Couldn't save that — try once more" }, { status: 500 });
  }

  await recordLeadEvent(admin, {
    userId,
    sessionId: (body.sessionId || "").trim() || null,
    eventType: "listing_question",
    listingKey: body.listingKey,
    citySlug: (body.citySlug || "").trim() || null,
    sourcePage: (body.sourcePage || "").slice(0, 300),
    metadata: { replyPref: body.replyPref ?? null, address: body.address ?? null },
  });

  await notifyGuide(`Question — ${body.address || body.listingKey}`, [
    `<b>${name}</b> asked about <b>${body.address || body.listingKey}</b>:`,
    `“${question}”`,
    `Reply to: ${email}${row.phone ? ` · ${row.phone}` : ""}${body.replyPref ? ` (prefers ${body.replyPref})` : ""}`,
  ]);

  return NextResponse.json({ ok: true });
}
