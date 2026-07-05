import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/db/server";

/* Guest-shelf adoption: on first sign-in the localStorage saves upsert
   here in one call. ignoreDuplicates means existing account rows win, so
   price_at_save keeps its earliest (most alert-worthy) value. RLS scopes
   everything to the session user. */
export async function POST(req: Request) {
  const supabase = await getSupabaseServer();
  if (!supabase)
    return NextResponse.json({ ok: false, error: "Accounts not configured" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  let body: {
    saves?: { listingKey: string; savedAt?: string; priceAtSave?: number; sourcePage?: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const saves = (body.saves ?? []).filter((s) => s?.listingKey).slice(0, 500);
  if (!saves.length) return NextResponse.json({ ok: true, merged: 0 });

  const { error } = await supabase.from("saved_listings").upsert(
    saves.map((s) => ({
      user_id: user.id,
      listing_key: s.listingKey,
      created_at: s.savedAt ?? new Date().toISOString(),
      price_at_save: Number.isFinite(s.priceAtSave) ? Math.round(s.priceAtSave!) : 0,
      last_seen_price: Number.isFinite(s.priceAtSave) ? Math.round(s.priceAtSave!) : null,
      source_page: s.sourcePage?.slice(0, 200) ?? null,
    })),
    { onConflict: "user_id,listing_key", ignoreDuplicates: true }
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, merged: saves.length });
}
