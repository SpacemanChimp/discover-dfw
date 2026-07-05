import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/db/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/* Saved listings for the signed-in user. The session rides the request
   cookies and every query passes RLS (publishable key — NOT the secret),
   so one user can never touch another's shelf even if this code errs.
   Guests never call these routes; their shelf stays in localStorage. */

async function requireUser(): Promise<
  { supabase: SupabaseClient; user: User } | NextResponse
> {
  const supabase = await getSupabaseServer();
  if (!supabase)
    return NextResponse.json({ ok: false, error: "Accounts not configured" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  return { supabase, user };
}

const toClient = (r: {
  id: string;
  listing_key: string;
  created_at: string;
  price_at_save: number;
  source_page: string | null;
  notes: string | null;
  last_seen_status: string | null;
  last_seen_price: number | null;
}) => ({
  id: r.id,
  listingKey: r.listing_key,
  savedAt: r.created_at,
  priceAtSave: r.price_at_save,
  sourcePage: r.source_page ?? undefined,
  notes: r.notes ?? undefined,
  lastSeenStatus: r.last_seen_status ?? undefined,
  lastSeenPrice: r.last_seen_price ?? undefined,
});

/** List the caller's saved listings, newest first. */
export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  const { supabase } = ctx;
  const { data, error } = await supabase
    .from("saved_listings")
    .select("id, listing_key, created_at, price_at_save, source_page, notes, last_seen_status, last_seen_price")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, saves: (data ?? []).map(toClient) });
}

/** Save one listing. Idempotent — re-saving keeps the original row. */
export async function POST(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  const { supabase, user } = ctx;

  let body: { listingKey?: string; price?: number; status?: string; sourcePage?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.listingKey || typeof body.listingKey !== "string")
    return NextResponse.json({ ok: false, error: "listingKey required" }, { status: 400 });
  const price = Number.isFinite(body.price) ? Math.round(body.price!) : 0;

  const { error } = await supabase.from("saved_listings").upsert(
    {
      user_id: user.id,
      listing_key: body.listingKey,
      price_at_save: price,
      last_seen_price: price || null,
      last_seen_status: body.status?.slice(0, 40) ?? null,
      source_page: body.sourcePage?.slice(0, 200) ?? null,
    },
    { onConflict: "user_id,listing_key", ignoreDuplicates: true }
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Unsave: DELETE /api/saved-listings?key=MOCK-1234 */
export async function DELETE(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  const { supabase, user } = ctx;
  const key = new URL(req.url).searchParams.get("key");
  if (!key) return NextResponse.json({ ok: false, error: "key required" }, { status: 400 });
  const { error } = await supabase
    .from("saved_listings")
    .delete()
    .match({ user_id: user.id, listing_key: key });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Record what the user just saw (price/status) — powers the
    "since you last looked" badges and future alerts.
    Body: { seen: [{ listingKey, price, status }] } */
export async function PATCH(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  const { supabase, user } = ctx;

  let body: { seen?: { listingKey: string; price?: number; status?: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const seen = (body.seen ?? []).slice(0, 100);
  for (const s of seen) {
    if (!s.listingKey) continue;
    await supabase
      .from("saved_listings")
      .update({
        last_seen_price: Number.isFinite(s.price) ? Math.round(s.price!) : null,
        last_seen_status: s.status?.slice(0, 40) ?? null,
      })
      .match({ user_id: user.id, listing_key: s.listingKey });
  }
  return NextResponse.json({ ok: true });
}
