import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { getSupabaseServer } from "@/lib/db/server";

/* Lead intake — showing requests, listing questions, and account signups.
   Persists to the Supabase `leads` table via the secret-key client (the
   table has no client RLS policies, so this route is the only door in).
   Falls back to server logging when the secret key isn't configured.
   CRM/agent-routing webhook remains a follow-up. */

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
  };

  const admin = getSupabaseAdmin();
  if (admin) {
    // attach the signed-in user when there is one (guests stay null)
    let userId: string | null = null;
    try {
      const session = await getSupabaseServer();
      userId = (await session?.auth.getUser())?.data.user?.id ?? null;
    } catch {
      /* no session — guest lead */
    }
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

  return NextResponse.json({ ok: true });
}
