import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { getSupabaseServer } from "@/lib/db/server";
import { looksLikeSpam, recordLeadEvent } from "@/lib/leads";
import { pushLeadToFub, type NormalizedLead } from "@/lib/crm/fub";
import { classifyContact, INTENTS, type IntentKey } from "@/lib/convert/intents";

/* Lead intake — showing requests, listing questions, account signups, and
   the contextual "guide" requests from the conversion panels
   (components/convert). Persists to the Supabase `leads` table via the
   secret-key client (the table has no client RLS policies, so this route
   is the only door in). Falls back to server logging when the secret key
   isn't configured. After storage, each lead is pushed to Follow Up Boss
   (lib/crm/fub — dry-run outside production; contact dedupe by FUB).

   Progressive enhancement: accepts JSON (the panels' fetch path) AND
   application/x-www-form-urlencoded (the panels' no-JS <form> fallback).
   Form posts derive missing page context from the Referer header and are
   answered with a redirect back to the page. */

const TYPES = new Set(["showing", "question", "account", "guide"]);

interface LeadBody {
  type?: string;
  listingKey?: string;
  address?: string;
  citySlug?: string;
  community?: string;
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
  /* guide-type fields (conversion panels) */
  intent?: string;
  contact?: string;
  primary?: string;
  budget?: string;
  timeline?: string;
  comparingWith?: string;
  /* spam guard */
  hp?: string;
  website?: string;
  openedAt?: number | string;
}

const fail = (isForm: boolean, error: string, status: number, referer: string) =>
  isForm
    ? // no-JS path: bounce back with a flag the page can render on
      NextResponse.redirect(new URL(`${referer}#request-error`, referer), 303)
    : NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const referer = req.headers.get("referer") || "https://www.discoverdfw.com/";
  const isForm = !(req.headers.get("content-type") || "").includes("application/json");

  let body: LeadBody;
  try {
    if (isForm) {
      const fd = await req.formData();
      body = Object.fromEntries(
        [...fd.entries()].filter(([, v]) => typeof v === "string")
      ) as unknown as LeadBody;
    } else {
      body = await req.json();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  // bots get a quiet yes and nothing stored (legacy senders omit these
  // fields entirely, which passes the check untouched)
  if (looksLikeSpam({ hp: body.hp ?? body.website, openedAt: Number(body.openedAt) || undefined })) {
    return isForm
      ? NextResponse.redirect(new URL(`${referer}#request-sent`, referer), 303)
      : NextResponse.json({ ok: true });
  }

  if (!body.type || !TYPES.has(body.type)) {
    return fail(isForm, "Unknown lead type", 400, referer);
  }

  /* ---- guide requests: classify the single email-or-mobile field ---- */
  let email = (body.email || "").trim();
  let phone = (body.phone || "").trim();
  let replyPref = body.replyPref || null;
  if (body.type === "guide") {
    if (!body.intent || !(body.intent in INTENTS)) {
      return fail(isForm, "Unknown request kind", 400, referer);
    }
    if (!(body.name || "").trim()) {
      return fail(isForm, "Add your name so the guide knows who's asking", 400, referer);
    }
    const contact = classifyContact(body.contact || "");
    if (!contact) {
      return fail(isForm, "Enter an email address or a 10-digit mobile number", 400, referer);
    }
    if (!(body.primary || "").trim()) {
      return fail(isForm, "Tell us the one thing to work from", 400, referer);
    }
    email = contact.email ?? "";
    phone = contact.phone ?? "";
    // mobile as the only contact = they expect a text back
    replyPref = phone && !email ? "text" : "email";
  } else {
    if (body.type !== "account" && !email && !phone) {
      return fail(isForm, "An email or phone number is required", 400, referer);
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail(isForm, "Invalid email", 400, referer);
    }
  }

  // form posts can't capture window.location — the Referer header carries
  // the original URL (path + query, so utm_* attribution survives)
  let sourcePage = (body.sourcePage || "").slice(0, 300) || null;
  if (!sourcePage && referer) {
    try {
      const u = new URL(referer);
      sourcePage = (u.pathname + u.search).slice(0, 300) || null;
    } catch {
      /* unparseable referer — leave null */
    }
  }

  const primary = (body.primary || "").trim().slice(0, 600) || null;
  const extraMessage = (body.message || "").trim().slice(0, 2000) || null;
  const lead = {
    receivedAt: new Date().toISOString(),
    type: body.type,
    intent: (body.intent || "").trim() || null,
    listingKey: body.listingKey || null,
    address: body.address || null,
    citySlug: (body.citySlug || "").trim() || null,
    community: (body.community || "").trim() || null,
    name: (body.name || "").trim() || null,
    email: email || null,
    phone: phone || null,
    primary,
    message: extraMessage,
    budget: (body.budget || "").trim().slice(0, 120) || null,
    timeline: (body.timeline || "").trim().slice(0, 120) || null,
    comparingWith: (body.comparingWith || "").trim().slice(0, 120) || null,
    day: body.day || null,
    timeOfDay: body.timeOfDay || null,
    tourMode: body.tourMode || null,
    replyPref,
    sourcePage,
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
    if (lead.type === "guide") {
      await recordLeadEvent(admin, {
        userId,
        sessionId: (body.sessionId || "").trim() || null,
        eventType: "guide_request",
        listingKey: null,
        citySlug: lead.citySlug,
        sourcePage: sourcePage ?? "",
        // context only — never the person's name/email/phone/free text
        metadata: {
          intent: lead.intent,
          community: lead.community,
          budget: lead.budget,
          timeline: lead.timeline,
          comparingWith: lead.comparingWith,
        },
      });
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
    guide: "guide_request",
  };
  await pushLeadToFub(admin, {
    kind: KIND[lead.type] ?? "account_signup",
    intent: (lead.intent as IntentKey) ?? null,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    message: [primary, extraMessage].filter(Boolean).join("\n\n") || null,
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
    budget: lead.budget,
    timeline: lead.timeline,
    comparingWith: lead.comparingWith,
  });

  return isForm
    ? NextResponse.redirect(new URL(`${referer}#request-sent`, referer), 303)
    : NextResponse.json({ ok: true });
}
