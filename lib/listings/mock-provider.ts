/* Mock listing provider — FAKE inventory ported from the design bundle's
   dfw-listings.js. Swapped out for the Trestle provider via lib/listings. */
import type { Listing, ListingProvider, SearchQuery, SearchResult } from "./types";
import raw from "./mock-data.json";

const ALL = raw as Listing[];

/* Frozen "feed refresh" timestamp — mock data never refreshes. The Trestle
   provider will report the real sync time. */
const AS_OF = "2026-07-01T06:00:00-05:00";

function matches(l: Listing, q: SearchQuery): boolean {
  if (q.citySlug && l.citySlug !== q.citySlug) return false;
  if (q.minPrice != null && l.listPrice < q.minPrice) return false;
  if (q.maxPrice != null && l.listPrice > q.maxPrice) return false;
  if (q.minBeds != null && l.bedsTotal < q.minBeds) return false;
  if (q.propertyType && l.propertyType !== q.propertyType) return false;
  if (q.newBuildsOnly && l.yearBuilt < 2020) return false;
  return true;
}

function sortListings(list: Listing[], sort: SearchQuery["sort"]): Listing[] {
  const out = list.slice();
  if (sort === "price-asc") out.sort((a, b) => a.listPrice - b.listPrice);
  else if (sort === "price-desc") out.sort((a, b) => b.listPrice - a.listPrice);
  else out.sort((a, b) => a.daysOnMarket - b.daysOnMarket); // newest first
  return out;
}

export const mockProvider: ListingProvider = {
  async search(query: SearchQuery): Promise<SearchResult> {
    const hits = sortListings(ALL.filter((l) => matches(l, query)), query.sort);
    return { listings: hits, total: hits.length, asOf: AS_OF };
  },

  async getByKey(listingKey: string): Promise<Listing | null> {
    return ALL.find((l) => l.listingKey === listingKey) ?? null;
  },

  async cityCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const l of ALL) counts[l.citySlug] = (counts[l.citySlug] || 0) + 1;
    return counts;
  },
};

export const allMockListings = ALL;
