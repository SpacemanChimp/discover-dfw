/* The provider contract every MLS backend implements. SERVER-SIDE ONLY —
   pages call a provider and pass plain objects down; client components never
   import this module. */
import type {
  CityMarketSnapshot,
  Listing,
  SearchFilters,
  SearchResult,
} from "./types";

export interface MlsProvider {
  /** Filtered, sorted, paged search across the active inventory. */
  searchListings(filters: SearchFilters): Promise<SearchResult>;
  /** One listing by its stable key; null when unknown or off-market. */
  getListingByKey(listingKey: string): Promise<Listing | null>;
  /** All active listings in a city, newest first. */
  getListingsByCity(citySlug: string): Promise<Listing[]>;
  /** Editorial picks — flagged listings first, freshest fill the rest. */
  getFeaturedListings(citySlug?: string, limit?: number): Promise<Listing[]>;
  /** Market stats for a city page/header; null for unknown slugs. */
  getCityMarketSnapshot(citySlug: string): Promise<CityMarketSnapshot | null>;
}
