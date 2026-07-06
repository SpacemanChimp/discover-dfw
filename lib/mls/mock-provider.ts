/* Mock MLS provider — serves the fictional inventory in data/mock-listings.
   Validates its own data at module load: the repo has no test runner, so a
   malformed mock listing fails typecheck/build instead of shipping. */
import type { MlsProvider } from "./provider";
import type { Listing, SearchFilters, SearchResult } from "./types";
import { mockListings, MOCK_MLS_LAST_UPDATED } from "@/data/mock-listings";
import { cityBySlug, cityMarketSnapshot } from "@/data/dfw-cities";

const DEFAULT_PAGE_SIZE = 24;

/* ---- lightweight validation (runs once at import, throws loudly) ---- */
function validate(listings: Listing[]): void {
  const seen = new Set<string>();
  for (const l of listings) {
    const where = `mock listing ${l.listingKey || "(missing key)"}`;
    if (!l.listingKey || seen.has(l.listingKey)) throw new Error(`${where}: duplicate or missing listingKey`);
    seen.add(l.listingKey);
    if (!cityBySlug[l.citySlug]) throw new Error(`${where}: unknown citySlug "${l.citySlug}"`);
    if (cityBySlug[l.citySlug].name !== l.cityName) throw new Error(`${where}: cityName mismatch`);
    if (!(l.listPrice > 0) || !(l.livingAreaSqft > 0)) throw new Error(`${where}: non-positive price or sqft`);
    if (!(l.bedsTotal > 0) || !(l.bathsTotal > 0)) throw new Error(`${where}: non-positive beds or baths`);
    if (!l.media.length || !l.media.some((m) => m.isPrimary)) throw new Error(`${where}: media needs a primary entry`);
    if (l.photoCount < l.media.length) throw new Error(`${where}: photoCount < media.length`);
    if (l.badge === "PRICE CUT" && !(l.originalListPrice && l.originalListPrice > l.listPrice))
      throw new Error(`${where}: PRICE CUT badge requires originalListPrice > listPrice`);
    if (!l.mlsSource || !l.mlsLastUpdated) throw new Error(`${where}: missing mlsSource/mlsLastUpdated`);
    if (Number.isNaN(Date.parse(l.listDate))) throw new Error(`${where}: bad listDate`);
  }
}
validate(mockListings);

/* ---- search mechanics ---- */
function matches(l: Listing, f: SearchFilters): boolean {
  if (f.citySlug && l.citySlug !== f.citySlug) return false;
  if (f.minPrice != null && l.listPrice < f.minPrice) return false;
  if (f.maxPrice != null && l.listPrice > f.maxPrice) return false;
  if (f.minBeds != null && l.bedsTotal < f.minBeds) return false;
  if (f.minBaths != null && l.bathsTotal < f.minBaths) return false;
  if (f.minSqft != null && l.livingAreaSqft < f.minSqft) return false;
  if (f.maxSqft != null && l.livingAreaSqft > f.maxSqft) return false;
  if (f.propertyType && l.propertyType !== f.propertyType) return false;
  if (f.statuses?.length && !f.statuses.includes(l.standardStatus)) return false;
  if (f.newBuildsOnly && l.yearBuilt < 2020) return false;
  return true;
}

function sorted(list: Listing[], sort: SearchFilters["sort"]): Listing[] {
  const out = list.slice();
  switch (sort) {
    case "price-asc":
      return out.sort((a, b) => a.listPrice - b.listPrice);
    case "price-desc":
      return out.sort((a, b) => b.listPrice - a.listPrice);
    case "sqft-desc":
      return out.sort((a, b) => b.livingAreaSqft - a.livingAreaSqft);
    case "newest":
    default:
      return out.sort((a, b) => a.daysOnMarket - b.daysOnMarket);
  }
}

export const mockProvider: MlsProvider = {
  async searchListings(filters: SearchFilters): Promise<SearchResult> {
    const hits = sorted(mockListings.filter((l) => matches(l, filters)), filters.sort);
    const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : DEFAULT_PAGE_SIZE;
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    return {
      listings: hits.slice((page - 1) * pageSize, page * pageSize),
      total: hits.length,
      page,
      pageSize,
      mlsLastUpdated: MOCK_MLS_LAST_UPDATED,
    };
  },

  async getListingByKey(listingKey: string): Promise<Listing | null> {
    return mockListings.find((l) => l.listingKey === listingKey) ?? null;
  },

  async getListingsByCity(citySlug: string): Promise<Listing[]> {
    return sorted(mockListings.filter((l) => l.citySlug === citySlug), "newest");
  },

  async getFeaturedListings(citySlug?: string, limit = 4): Promise<Listing[]> {
    const pool = citySlug ? mockListings.filter((l) => l.citySlug === citySlug) : mockListings;
    const flagged = pool.filter((l) => l.featured);
    const rest = sorted(pool.filter((l) => !l.featured), "newest");
    return [...flagged, ...rest].slice(0, limit);
  },

  async getActiveCountsByCity(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const l of mockListings) out[l.citySlug] = (out[l.citySlug] || 0) + 1;
    return out;
  },

  async getCityMarketSnapshot(citySlug: string) {
    const active = mockListings.filter(
      (l) => l.citySlug === citySlug && l.standardStatus === "Active"
    ).length;
    return cityMarketSnapshot(citySlug, active, MOCK_MLS_LAST_UPDATED);
  },
};
