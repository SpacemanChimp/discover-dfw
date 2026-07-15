import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { getSupabaseServer } from "@/lib/db/server";
import { pushLeadToFub, type NormalizedLead } from "@/lib/crm/fub";

/* Lead intake — showing requests, listing questions, and account signups.
   Persists to the Supabase `leads` table via the secret-key client (the
   table has no client RLS policies, so this route is the only door in).
   Falls back to server logging when the secret key isn't configured.
   After storage, each lead is pushed to Follow Up Boss (lib/crm/fub —
   dry-run outside production; contact dedupe handled by FUB /events). */

const TYPES = new Set(["showing", "question", "account"]);

interface LeadBody {
  type?: string;
  listingKey?: string;
  address?: string;
  citySlug?: string;
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  day?: string;
  timeOfDay?: string;
  tourMode?: string;
  replyPref?: string;
  sourcePage?: string;
  referrer?: string;
  sessionId?: string;
}

export async function POST(req: Request) {
  let body: LeadBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.type || !TYPES.has(body.type)) {
    return NextResponse.json({ ok: false, error: "Unknown lead type" }, { status: 400 });
  }
  const email = (body.email || "").trim();
  const phone = (body.phone || "").trim();
  if (body.type !== "account" && !email && !phone) {
    return NextResponse.json(
      { ok: false, error: "An email or phone number is required" },
      { status: 400 }
    );
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
  }

  const lead = {
    receivedAt: new Date().toISOString(),
    type: body.type,
    listingKey: body.listingKey || null,
    address: body.address || null,
    citySlug: body.citySlug || null,
    name: (body.name || "").trim() || null,
    email: email || null,
    phone: phone || null,
    message: (body.message || "").slice(0, 2000) || null,
    day: body.day || null,
    timeOfDay: body.timeOfDay || null,
    tourMode: body.tourMode || null,
    replyPref: body.replyPref || null,
    sourcePage: (body.sourcePage || "").slice(0, 300) || null,
    referrer: (body.referrer || "").slice(0, 300) || null,
  };

  const admin = getSupabaseAdmin();
  // attach the signed-in user when there is one (guests stay null)
  let userId: string | null = null;
  try {
    const session = await getSupabaseServer();
    userId = (await session?.auth.getUser())?.data.user?.id ?? null;
  } catch {
    /* no session — guest lead */
  }
  if (admin) {
    const { error } = await admin.from("leads").insert({
      user_id: userId,
      type: lead.type,
      listing_key: lead.listingKey,
      payload: lead,
    });
    if (error) {
      console.error("[lead] db insert failed, logging instead:", error.message);
      console.log("[lead]", JSON.stringify(lead));
    }
  } else {
    // secret key not configured — keep the paper trail in the logs
    console.log("[lead]", JSON.stringify(lead));
  }

  // CRM push last — the lead is already persisted above. Never throws.
  const KIND: Record<string, NormalizedLead["kind"]> = {
    showing: "showing_request",
    question: "listing_question",
    account: "account_signup",
  };
  await pushLeadToFub(admin, {
    kind: KIND[lead.type] ?? "account_signup",
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    message: lead.message,
    listingKey: lead.listingKey,
    address: lead.address,
    citySlug: lead.citySlug,
    sourcePage: lead.sourcePage,
    referrer: lead.referrer,
    sessionId: (body.sessionId || "").trim() || null,
    userId,
    submittedAt: lead.receivedAt,
    requestedDay: lead.day,
    timeWindow: lead.timeOfDay,
    tourMode: lead.tourMode,
    replyPref: lead.replyPref,
  });

  return NextResponse.json({ ok: true });
}
