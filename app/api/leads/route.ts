import { NextResponse } from "next/server";

/* Lead intake — showing requests, listing questions, and Phase-1 account
   signups. Phase 2 wires this to the CRM/agent-routing webhook and durable
   storage; until then leads are validated and logged server-side so the
   contract with the client is stable. */

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

  // TODO(phase-2): persist + forward to CRM / the assigned local guide.
  console.log("[lead]", JSON.stringify(lead));

  return NextResponse.json({ ok: true });
}
