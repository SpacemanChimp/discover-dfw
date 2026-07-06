/* Row types for the local MLS listings store (migration 0006) — the
   contract between the future sync job and the future local provider.
   Nothing reads these tables yet; the live trestle provider still serves
   the site. Snake_case mirrors the Postgres columns 1:1.

   `raw` is the unmodified feed payload for server-side debugging only —
   the tables are RLS-locked to the service role, and any future
   client-facing read path must select explicit columns, never `raw`. */

export interface ListingRow {
  listing_key: string;
  listing_id: string;
  standard_status: string;
  list_price: number | null;
  close_price: number | null;
  beds: number | null;
  baths: number | null;
  living_area: number | null;
  lot_size: number | null; // acres
  year_built: number | null;
  property_type: string;
  property_sub_type: string | null;
  street_number: string | null;
  street_name: string | null;
  unparsed_address: string;
  city: string;
  state: string;
  postal_code: string | null;
  county: string | null;
  subdivision: string | null;
  latitude: number | null;
  longitude: number | null;
  public_remarks: string | null;
  list_office_name: string | null;
  /** Populated only if IDX display rules permit agent-level display. */
  list_agent_name: string | null;
  originating_system_name: string | null;
  modification_timestamp: string;
  photos_count: number | null;
  /** SERVER-ONLY debugging payload — never expose publicly. */
  raw: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ListingMediaRow {
  id: string;
  listing_key: string;
  media_key: string | null;
  media_url: string;
  order: number;
  media_type: string;
  modification_timestamp: string | null;
  created_at: string;
}

export type SyncRunStatus = "running" | "success" | "partial" | "failed";

export interface MlsSyncRunRow {
  id: string;
  provider: string;
  started_at: string;
  finished_at: string | null;
  status: SyncRunStatus;
  records_seen: number;
  records_upserted: number;
  records_failed: number;
  error_summary: string | null;
}

export interface MlsSyncErrorRow {
  id: string;
  run_id: string;
  listing_key: string | null;
  /** fetch | map | upsert | media */
  stage: string;
  message: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface CityMarketSnapshotRow {
  id: string;
  city_slug: string;
  as_of: string; // date
  active_listings: number;
  median_list_price: number | null;
  price_per_sqft: number | null;
  median_days_on_market: number | null;
  source: string;
  created_at: string;
}
