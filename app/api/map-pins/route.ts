import { NextResponse } from "next/server";
import { parseSearchFilters } from "@/lib/mls/url";
import { searchMapPins, MAP_PIN_CAP, DFW_BOUNDS } from "@/lib/mls/local";

/* Map pins for the live search map. PUBLIC on purpose — this is exactly the
   data the search pages already render (price/beds/baths/address/coords),
   never raw or remarks. Filters ride the same query-string contract as
   /homes via parseSearchFilters (city, min, max, beds, baths, minsqft,
   maxsqft, type, status, new, q, r, poly). An optional
   bbox=minLon,minLat,maxLon,maxLat viewport hint narrows the query to the
   visible map — it is NOT part of SearchFilters. CDN caches for 5 minutes. */

export const dynamic = "force-dynamic";

/** Parse + validate the bbox hint: 4 finite numbers, minLon<maxLon,
    minLat<maxLat, clamped into the DFW region. Anything else → undefined
    (the hint is best-effort; a bad one is just ignored). */
function parseBbox(raw: string | null) {
  if (!raw) return undefined;
  const n = raw.split(",").map(Number);
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return undefined;
  const [minLon, minLat, maxLon, maxLat] = n;
  if (minLon >= maxLon || minLat >= maxLat) return undefined;
  const clampLat = (v: number) => Math.min(DFW_BOUNDS.maxLat, Math.max(DFW_BOUNDS.minLat, v));
  const clampLon = (v: number) => Math.min(DFW_BOUNDS.maxLon, Math.max(DFW_BOUNDS.minLon, v));
  return {
    minLat: clampLat(minLat),
    maxLat: clampLat(maxLat),
    minLon: clampLon(minLon),
    maxLon: clampLon(maxLon),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const filters = parseSearchFilters(params);
  const bbox = parseBbox(url.searchParams.get("bbox"));

  try {
    const { pins, total } = await searchMapPins(filters, { bbox });
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
