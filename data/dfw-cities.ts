/* City dataset bridge for the MLS layer — reuses the editorial geography
   dataset (lib/dfw-data) rather than duplicating it, and shapes city rows
   into CityMarketSnapshot objects. Price/$sqft/DOM come from the dataset's
   snapshot-seeded figures (see lib/dfw-data.ts header); YoY is an editorial
   estimate. Used as the fallback when no live snapshot is available. */
import { cities, bySlug, countyById, counties, type City } from "@/lib/dfw-data";
import type { CityMarketSnapshot } from "@/lib/mls/types";

export { cities as dfwCities, bySlug as cityBySlug, countyById };
export type { City };

/* The 8 DFW-metro counties as the MLS feed reports CountyOrParish ("Denton",
   "Tarrant", …). The MLS ingestion boundary: every municipality in these
   counties is replicated (not just the 90 curated city profiles), so a
   school/district search returns all legitimate matches — Corinth, Copper
   Canyon, Bartonville, etc. — while browsing keeps its curated scope. */
export const dfwCountyNames: string[] = counties.map((c) => c.name);

export function cityMarketSnapshot(
  citySlug: string,
  activeListings: number,
  asOf: string
): CityMarketSnapshot | null {
  const c = bySlug[citySlug];
  if (!c) return null;
  return {
    citySlug: c.slug,
    cityName: c.name,
    countyName: countyById[c.county]?.name ?? c.county,
    tagline: c.tagline,
    isd: c.isd,
    medianListPrice: c.price,
    pricePerSqft: c.ppsf,
    medianDaysOnMarket: c.dom,
    yoyChange: c.yoy,
    activeListings,
    asOf,
  };
}
