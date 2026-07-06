/* Local MLS provider — serves the site from the replicated Postgres store
   (migration 0006, filled by /api/mls/sync). SERVER-ONLY: reads via the
   service-role client (the tables have no anon policies), maps rows to the
   domain Listing, and NEVER passes `raw` beyond derived scalars.

   Freshness = sync cadence (daily on Vercel Hobby cron), vs the trestle
   provider's 15-minute ISR against the live API — flip MLS_PROVIDER=local
   only when that tradeoff is right. Known gaps vs trestle: no open-house
   data (not replicated), "newest" sort approximates via the replicated
   CumulativeDaysOnMarket kept in raw. */
import "server-only";
import { attributionLine, DEEMED_RELIABLE_DISCLAIMER, MLS_SOURCE } from "@/lib/compliance";
import type { MlsProvider } from "./provider";
import type {
  Listing,
  ListingBadge,
  ListingStatus,
  PropertyType,
  SearchFilters,
  SearchResult,
  SortKey,
} from "./types";
import { dfwCities, cityBySlug, cityMarketSnapshot } from "@/data/dfw-cities";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { getOpenHouses, openHouseBadge } from "./trestle";

const DEFAULT_PAGE_SIZE = 24;
const DEFAULT_STATUSES: ListingStatus[] = ["Active", "ActiveUnderContract", "ComingSoon", "Pending"];
const CITY_BY_NAME = new Map(dfwCities.map((c) => [c.name.toLowerCase(), c]));

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapPropertyType(r: any): PropertyType {
  if (r.property_type === "Land") return "Land";
  if (r.property_type === "ResidentialIncome") return "Multi-family";
  switch (r.property_sub_type) {
    case "Townhouse":
      return "Townhome";
    case "Condominium":
      return "Condo";
    default:
      return "Single family";
  }
}

function toListing(r: any): Listing {
  const cityName: string = r.city || "";
  const known = CITY_BY_NAME.get(cityName.toLowerCase());
  const dom: number = Math.max(0, r.days_on_market ?? Number(r.raw?.CumulativeDaysOnMarket ?? 0));
  const media = ((r.listing_media as any[]) ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((m, i) => ({ url: m.media_url as string, caption: "", order: m.order ?? i, isPrimary: i === 0 }));
  // feed withholds OriginalListPrice; PreviousListPrice is our own history
  const original = Number(r.raw?.OriginalListPrice ?? r.raw?.PreviousListPrice ?? 0);
  const priceCut = original > 0 && Number(r.list_price) > 0 && original > Number(r.list_price);
  const badge: ListingBadge = priceCut ? "PRICE CUT" : dom <= 7 ? "NEW" : "ACTIVE";
  const hood: string = r.subdivision || cityName;

  return {
    listingKey: r.listing_key,
    listingId: r.listing_id || r.listing_key,
    standardStatus: (r.standard_status as ListingStatus) ?? "Active",
    badge,
    daysOnMarket: dom,
    listDate: new Date(Date.now() - dom * 86_400_000).toISOString().slice(0, 10),
    listPrice: Number(r.list_price ?? 0),
    originalListPrice: priceCut ? original : undefined,
    bedsTotal: r.beds ?? 0,
    bathsTotal: Number(r.baths ?? 0),
    livingAreaSqft: r.living_area ?? 0,
    lotSizeAcres: r.lot_size != null ? Number(r.lot_size) : undefined,
    yearBuilt: r.year_built ?? 0,
    propertyType: mapPropertyType(r),
    unparsedAddress: r.unparsed_address || "Address withheld",
    citySlug: known?.slug ?? cityName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    cityName,
    neighborhood: hood,
    postalCode: r.postal_code ?? undefined,
    lonLat: r.longitude != null && r.latitude != null ? [r.longitude, r.latitude] : undefined,
    media,
    photoCount: r.photos_count ?? media.length,
    photoLabel: `${cityName} — ${r.photos_count ?? media.length} photos`,
    publicRemarks: r.public_remarks ?? undefined,
    editorialNote:
      badge === "NEW"
        ? `New to the ${cityName} market — day ${Math.max(dom, 1)} on the books.`
        : `${hood}, ${cityName} — ${dom} days on the market.`,
    listingBrokerName: null,
    listingOfficeName: r.list_office_name ?? null,
    mlsSource: MLS_SOURCE.live,
    mlsLastUpdated: r.modification_timestamp,
    attributionText: r.list_office_name ? attributionLine(r.list_office_name) : null,
    disclaimerText: DEEMED_RELIABLE_DISCLAIMER,
  };
}

function applyFilters(query: any, f: SearchFilters) {
  const statuses = f.statuses?.length ? f.statuses : DEFAULT_STATUSES;
  query = query.in("standard_status", statuses);

  if (f.citySlug) {
    const city = cityBySlug[f.citySlug];
    query = query.eq("city", city ? city.name : f.citySlug);
  } else {
    query = query.in("city", dfwCities.map((c) => c.name));
  }
  if (f.minPrice != null) query = query.gte("list_price", f.minPrice);
  if (f.maxPrice != null) query = query.lte("list_price", f.maxPrice);
  if (f.minBeds != null) query = query.gte("beds", f.minBeds);
  if (f.minBaths != null) query = query.gte("baths", f.minBaths);
  if (f.minSqft != null) query = query.gte("living_area", f.minSqft);
  if (f.maxSqft != null) query = query.lte("living_area", f.maxSqft);
  if (f.newBuildsOnly) query = query.gte("year_built", 2024);
  if (f.q) {
    // full-text search over the generated search_tsv column (0008) —
    // the old 3-column ilike detoasted every row's remarks and rode the
    // statement-timeout line. websearch syntax: plain words, quoted
    // phrases, OR, minus-exclusion.
    const term = f.q.replace(/[():|&!*<>\\]/g, " ").trim();
    if (term) query = query.textSearch("search_tsv", term, { type: "websearch" });
  }

  switch (f.propertyType) {
    case "Land":
      query = query.eq("property_type", "Land");
      break;
    case "Multi-family":
      query = query.eq("property_type", "ResidentialIncome");
      break;
    case "Townhome":
      query = query.eq("property_sub_type", "Townhouse");
      break;
    case "Condo":
    case "High-rise condo":
      query = query.eq("property_sub_type", "Condominium");
      break;
    case "Single family":
      query = query.eq("property_sub_type", "SingleFamilyResidence");
      break;
  }
  return query;
}

function applySort(query: any, sort: SortKey | undefined) {
  switch (sort) {
    case "price-asc":
      return query.order("list_price", { ascending: true, nullsFirst: false });
    case "price-desc":
      return query.order("list_price", { ascending: false, nullsFirst: false });
    case "sqft-desc":
      return query.order("living_area", { ascending: false, nullsFirst: false });
    case "newest":
    default:
      // days_on_market is a real indexed column (0007) — never sort by a
      // jsonb path here; that detoasts every row and blows the timeout
      return query
        .order("days_on_market", { ascending: true, nullsFirst: false })
        .order("modification_timestamp", { ascending: false });
  }
}

const SELECT = "*, listing_media(media_url, \"order\")";

async function search(filters: SearchFilters): Promise<SearchResult> {
  const db = getSupabaseAdmin();
  if (!db) return { listings: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, mlsLastUpdated: new Date().toISOString() };
  const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : DEFAULT_PAGE_SIZE;
  const page = filters.page && filters.page > 0 ? filters.page : 1;

  let data: any[] | null;
  let count: number | null;

  if (filters.q) {
    /* Keyword searches go two-phase: a wide select riding the FTS bitmap
       scan detoasts thousands of matched rows and blows the statement
       timeout on broad terms ("pool" ≈ 10k matches). Phase 1 pages slim
       keys under the GIN index; phase 2 fetches full rows for just this
       page by key. */
    let slim = db.from("listings").select("listing_key", { count: "exact" });
    slim = applyFilters(slim, filters);
    slim = applySort(slim, filters.sort);
    const phase1 = await slim.range((page - 1) * pageSize, page * pageSize - 1);
    if (phase1.error) throw new Error(`local provider (q keys): ${phase1.error.message}`);
    const keys: string[] = (phase1.data ?? []).map((r: any) => r.listing_key);
    count = phase1.count;
    if (!keys.length) {
      data = [];
    } else {
      const phase2 = await db.from("listings").select(SELECT).in("listing_key", keys);
      if (phase2.error) throw new Error(`local provider (q rows): ${phase2.error.message}`);
      const rank = new Map(keys.map((k, i) => [k, i]));
      data = (phase2.data ?? []).sort(
        (a: any, b: any) => (rank.get(a.listing_key) ?? 0) - (rank.get(b.listing_key) ?? 0)
      );
    }
  } else {
    let query = db.from("listings").select(SELECT, { count: "exact" });
    query = applyFilters(query, filters);
    query = applySort(query, filters.sort);
    const res = await query.range((page - 1) * pageSize, page * pageSize - 1);
    if (res.error) throw new Error(`local provider: ${res.error.message}`);
    data = res.data;
    count = res.count;
  }

  const listings = (data ?? []).map(toListing);
  return {
    listings,
    total: count ?? listings.length,
    page,
    pageSize,
    mlsLastUpdated: listings.map((l) => l.mlsLastUpdated).sort().at(-1) ?? new Date().toISOString(),
  };
}

export const localProvider: MlsProvider = {
  async searchListings(filters: SearchFilters): Promise<SearchResult> {
    return search(filters);
  },

  async getListingByKey(listingKey: string): Promise<Listing | null> {
    if (!/^\d+$/.test(listingKey)) return null;
    const db = getSupabaseAdmin();
    if (!db) return null;
    const { data } = await db.from("listings").select(SELECT).eq("listing_key", listingKey).maybeSingle();
    if (!data) return null;
    const listing = toListing(data);
    // open houses aren't replicated — fetch live (detail views + alert
    // sweep only; never fails the listing)
    try {
      listing.openHouses = await getOpenHouses(listingKey);
      if (listing.badge === "ACTIVE") listing.badge = openHouseBadge(listing.openHouses) ?? listing.badge;
    } catch {
      listing.openHouses = [];
    }
    return listing;
  },

  async getListingsByCity(citySlug: string): Promise<Listing[]> {
    return (await search({ citySlug, statuses: ["Active"], sort: "newest", pageSize: 100 })).listings;
  },

  async getFeaturedListings(citySlug?: string, limit = 4): Promise<Listing[]> {
    const result = await search({ citySlug, statuses: ["Active"], sort: "newest", pageSize: Math.max(limit * 3, 12) });
    const withPhotos = result.listings.filter((l) => l.media[0]?.url);
    const rest = result.listings.filter((l) => !l.media[0]?.url);
    return [...withPhotos, ...rest].slice(0, limit);
  },

  async getCityMarketSnapshot(citySlug: string) {
    const db = getSupabaseAdmin();
    const base = (active: number, asOf: string) => cityMarketSnapshot(citySlug, active, asOf);
    if (!db || !cityBySlug[citySlug]) return base(0, new Date().toISOString());
    const { data } = await db
      .from("city_market_snapshots")
      .select("*")
      .eq("city_slug", citySlug)
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle();
    const snap = base(data?.active_listings ?? 0, data?.created_at ?? new Date().toISOString());
    if (!snap) return null;
    // on-market status counts (never sold data) — two cheap head-counts,
    // ISR caches the page so these don't run per visitor
    const cityName = cityBySlug[citySlug].name;
    const countOf = async (status: string) => {
      const { count: n } = await db
        .from("listings")
        .select("listing_key", { count: "exact", head: true })
        .eq("city", cityName)
        .eq("standard_status", status);
      return n ?? 0;
    };
    const [auc, pending] = await Promise.all([countOf("ActiveUnderContract"), countOf("Pending")]);
    return {
      ...snap,
      medianListPrice: data?.median_list_price != null ? Number(data.median_list_price) : snap.medianListPrice,
      pricePerSqft: data?.price_per_sqft != null ? Number(data.price_per_sqft) : snap.pricePerSqft,
      medianDaysOnMarket:
        data?.median_days_on_market != null ? Number(data.median_days_on_market) : snap.medianDaysOnMarket,
      statusCounts: {
        Active: data?.active_listings ?? 0,
        ActiveUnderContract: auc,
        Pending: pending,
      },
    };
  },

  async getActiveCountsByCity(): Promise<Record<string, number>> {
    const db = getSupabaseAdmin();
    const out: Record<string, number> = {};
    if (!db) return out;
    // latest snapshot per city is one cheap read; live head-counts as fallback
    const { data } = await db
      .from("city_market_snapshots")
      .select("city_slug, active_listings, as_of")
      .order("as_of", { ascending: false })
      .limit(dfwCities.length * 2);
    for (const row of data ?? []) {
      if (!(row.city_slug in out)) out[row.city_slug] = row.active_listings;
    }
    for (const c of dfwCities) {
      if (!(c.slug in out)) {
        const { count } = await db
          .from("listings")
          .select("listing_key", { count: "exact", head: true })
          .eq("city", c.name)
          .eq("standard_status", "Active");
        out[c.slug] = count ?? 0;
      }
    }
    return out;
  },
};
