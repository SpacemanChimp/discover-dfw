/* Shared MLS domain types — the single source of truth for search, listing
   pages, city snapshots, saved homes, and lead forms.

   Field names track the RESO Data Dictionary where a counterpart exists
   (ListingKey, ListingId, StandardStatus, ListPrice, BedroomsTotal,
   LivingArea, YearBuilt, DaysOnMarket, PublicRemarks, UnparsedAddress) so
   the Trestle IDX Plus provider maps 1:1. Everything else is Discover DFW
   editorial or compliance scaffolding. */

export type ListingStatus =
  | "Active"
  | "ActiveUnderContract"
  | "ComingSoon"
  | "Pending"
  | "Closed"
  | "Withdrawn";

export type PropertyType =
  | "Single family"
  | "Townhome"
  | "Condo"
  | "High-rise condo"
  | "Bungalow"
  | "Cottage"
  | "Craftsman"
  | "Tudor"
  | "Custom"
  | "Multi-family"
  | "Land";

/** Editorial badge derived from status + market activity. */
export type ListingBadge = "NEW" | "OPEN SAT" | "OPEN SUN" | "PRICE CUT" | "ACTIVE";

export interface ListingMedia {
  /** null until the IDX photo CDN lands — UI renders the caption slot. */
  url: string | null;
  caption: string;
  order: number;
  isPrimary?: boolean;
}

export interface Listing {
  /* identity */
  listingKey: string;
  /** Display MLS number (RESO ListingId). Mock ids until the live feed. */
  listingId: string;

  /* status & lifecycle */
  standardStatus: ListingStatus;
  badge: ListingBadge;
  daysOnMarket: number;
  listDate: string;

  /* price & size */
  listPrice: number;
  /** Set when the price has changed — powers PRICE CUT math. */
  originalListPrice?: number;
  bedsTotal: number;
  bathsTotal: number;
  livingAreaSqft: number;
  lotSizeAcres?: number;
  yearBuilt: number;
  propertyType: PropertyType;

  /* location */
  unparsedAddress: string;
  citySlug: string;
  cityName: string;
  neighborhood: string;
  postalCode?: string;
  /** [lon, lat] — mock data pins to the city centroid; Trestle supplies real coords. */
  lonLat?: [number, number];

  /* content */
  media: ListingMedia[];
  photoCount: number;
  /** Primary-photo caption shortcut for placeholder slots. */
  photoLabel: string;
  /** Feed remarks (RESO PublicRemarks) — placeholder until live data. */
  publicRemarks?: string;
  /** The field-guide voice — one line, ours, not the feed's. */
  editorialNote: string;
  featured?: boolean;

  /* compliance — required display slots under IDX rules */
  listingBrokerName: string | null;
  listingOfficeName: string | null;
  mlsSource: string;
  mlsLastUpdated: string;
  /** Prebuilt "Listing courtesy of …" line; null renders the reserved slot. */
  attributionText: string | null;
  disclaimerText: string | null;
}

export interface CityMarketSnapshot {
  citySlug: string;
  cityName: string;
  countyName: string;
  tagline: string;
  isd: string;
  /** PLACEHOLDER figures from the editorial dataset until live market data. */
  medianListPrice: number;
  pricePerSqft: number;
  medianDaysOnMarket: number;
  yoyChange: string;
  activeListings: number;
  asOf: string;
}

export type SortKey = "newest" | "price-asc" | "price-desc" | "sqft-desc";

export interface SearchFilters {
  citySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  minBaths?: number;
  minSqft?: number;
  maxSqft?: number;
  propertyType?: PropertyType;
  statuses?: ListingStatus[];
  newBuildsOnly?: boolean;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  listings: Listing[];
  total: number;
  page: number;
  pageSize: number;
  /** When the source data was last refreshed — IDX rules require display. */
  mlsLastUpdated: string;
}

/* ---- personal state (localStorage in Phase 1/2, account DB later) ---- */

export interface SavedHome {
  listingKey: string;
  savedAt: string;
  priceAtSave: number;
}

export interface SavedSearchFilter {
  id: string;
  name: string;
  /** Structured filters — replayable against any provider. */
  filters?: SearchFilters;
  /** Human-readable line, e.g. "Denton · 3+ bd · ≤ $550,000". */
  queryLabel: string;
  /** Serialized query string for /homes, e.g. "city=denton&beds=3". */
  queryString: string;
  frequency: "Instant" | "Daily digest" | "Weekly letter";
  createdAt: string;
}
