import { NextResponse } from "next/server";
import { parseSearchFilters } from "@/lib/mls/url";
import { searchMapPins, MAP_PIN_CAP } from "@/lib/mls/local";

/* Map pins for the live search map. PUBLIC on purpose — this is exactly the
   data the search pages already render (price/beds/baths/address/coords),
   never raw or remarks. Filters ride the same query-string contract as
   /homes via parseSearchFilters (city, min, max, beds, baths, minsqft,
   maxsqft, type, status, new, q, r). CDN caches for 5 minutes. */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params: Record<string, string> = {};
  new URL(req.url).searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const filters = parseSearchFilters(params);

  try {
    const { pins, total } = await searchMapPins(filters);
    return NextResponse.json(
      { pins, total, capped: pins.length < total && pins.length >= MAP_PIN_CAP },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (e) {
    console.error("map-pins:", e instanceof Error ? e.message : e);
    return NextResponse.json({ pins: [], total: 0, capped: false }, { status: 500 });
  }
}
