/* Listing domain types. Field names are RESO-Data-Dictionary-aligned so the
   future Trestle IDX Plus provider maps 1:1 (ListingKey, StandardStatus,
   ListPrice, BedroomsTotal, LivingArea, YearBuilt, DaysOnMarket...). */

export type StandardStatus = "Active" | "ActiveUnderContract" | "Pending" | "Closed";

export interface Listing {
  listingKey: string;
  standardStatus: StandardStatus;
  /** Editorial badge from the feed/mock: NEW | OPEN SAT | OPEN SUN | PRICE CUT | ACTIVE */
  badge: string;
  listPrice: number;
  bedsTotal: number;
  bathsTotal: number;
  livingAreaSqft: number;
  yearBuilt: number;
  propertyType: string;
  daysOnMarket: number;
  unparsedAddress: string;
  citySlug: string;
  neighborhood: string;
  /** Placeholder photo caption until the IDX photo CDN lands. */
  photoLabel: string;
  photoCount: number;
  editorialNote: string;
  /** Reserved IDX attribution — listing brokerage name from the feed. */
  courtesyOf: string | null;
}

export interface SearchQuery {
  citySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  propertyType?: string;
  newBuildsOnly?: boolean;
  sort?: "newest" | "price-asc" | "price-desc";
}

export interface SearchResult {
  listings: Listing[];
  total: number;
  /** When this data was last refreshed from the source (IDX rules require display). */
  asOf: string;
}

export interface ListingProvider {
  search(query: SearchQuery): Promise<SearchResult>;
  getByKey(listingKey: string): Promise<Listing | null>;
  /** Active-listing counts per citySlug, for index rows and map pins. */
  cityCounts(): Promise<Record<string, number>>;
}

/* ---- client-side personal state (localStorage in Phase 1, DB later) ---- */
export interface SavedHome {
  listingKey: string;
  savedAt: string;
  priceAtSave: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  /** Human-readable query line, e.g. "Denton · 3+ bd · ≤ $550,000" */
  queryLabel: string;
  /** Serialized query string for /homes, e.g. "city=denton&beds=3&max=550000" */
  queryString: string;
  frequency: "Instant" | "Daily digest" | "Weekly letter";
  createdAt: string;
}
