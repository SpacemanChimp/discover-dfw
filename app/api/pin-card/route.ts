import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/admin";

/* Compact card payload for a tapped map pin. PUBLIC on purpose — the same
   fields the search cards already render (price/beds/baths/sqft/address)
   plus up to 6 photo URLs by media "order". The jsonb `raw` column NEVER
   leaves the server: only the derived PreviousListPrice scalar is read
   (our own price history, written by /api/mls/sync) and surfaced as
   priceCutFrom. CDN caches for 15 minutes. */

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(req: Request) {
  const k = new URL(req.url).searchParams.get("k") ?? "";
  // real NTREIS keys are numeric — mock ids and junk are a plain 404,
  // never a DB round-trip
  if (!/^\d+$/.test(k)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  try {
    // single row by pk + its media — reading one row's raw scalar
    // (raw->PreviousListPrice) server-side is fine; never sort/filter by it
    const [row, media] = await Promise.all([
      db
        .from("listings")
        .select(
          "listing_key, list_price, beds, baths, living_area, unparsed_address, city, county, lot_size, property_type, property_sub_type, prev:raw->PreviousListPrice"
        )
        .eq("listing_key", k)
        .maybeSingle(),
      db
        .from("listing_media")
        .select('media_url, "order"')
        .eq("listing_key", k)
        .order("order", { ascending: true })
        .limit(6),
    ]);
    if (row.error) throw new Error(`pin-card row: ${row.error.message}`);
    if (media.error) throw new Error(`pin-card media: ${media.error.message}`);
    const r: any = row.data;
    if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });

    const price = Number(r.list_price ?? 0);
    const prev = Number(r.prev ?? 0);
    return NextResponse.json(
      {
        k: r.listing_key,
        price,
        priceCutFrom: prev > price ? prev : null,
        beds: r.beds ?? 0,
        baths: Number(r.baths ?? 0),
        sqft: r.living_area ?? 0,
        address: r.unparsed_address || "Address withheld",
        city: r.city || "",
        // land scalars — let the map popup render acreage/$-per-acre/subtype
        county: r.county || "",
        acres: r.lot_size != null ? Number(r.lot_size) : null,
        isLand: r.property_type === "Land",
        subtype: r.property_sub_type || null,
        imgs: ((media.data as any[]) ?? [])
          .map((m) => m.media_url as string)
          .filter(Boolean)
          .slice(0, 6),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
        },
      }
    );
  } catch (e) {
    console.error("pin-card:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
