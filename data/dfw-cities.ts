/* City dataset bridge for the MLS layer — reuses the editorial geography
   dataset (lib/dfw-data) rather than duplicating it, and shapes city rows
   into CityMarketSnapshot objects. Market figures remain PLACEHOLDERS from
   the editorial dataset until live market data lands. */
import { cities, bySlug, countyById, type City } from "@/lib/dfw-data";
import type { CityMarketSnapshot } from "@/lib/mls/types";

export { cities as dfwCities, bySlug as cityBySlug, countyById };
export type { City };

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
