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
import { dfwCities, cityBySlug, cityMarketSnapshot, dfwCountyNames } from "@/data/dfw-cities";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { boundingBox, milesBetween, pointInPolygon, polygonBounds, type LonLat } from "./geo";
import { getOpenHouses, openHouseBadge, getFutureOpenHouseIndex } from "./trestle";
import { defaultPropertyTypes } from "./feature-search";
import { schoolsFromReso, schoolMatchToken } from "./school-fields";
import { subtypesForCategory } from "@/lib/land/land";
import { unstable_cache } from "next/cache";

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
    landSubtype: r.property_sub_type ?? undefined,
    yearBuilt: r.year_built ?? 0,
    propertyType: mapPropertyType(r),
    unparsedAddress: r.unparsed_address || "Address withheld",
    citySlug: known?.slug ?? cityName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    cityName,
    county: r.county ?? (r.raw?.CountyOrParish as string | undefined) ?? undefined,
    neighborhood: hood,
    postalCode: r.postal_code ?? undefined,
    lonLat: r.longitude != null && r.latitude != null ? [r.longitude, r.latitude] : undefined,
    media,
    photoCount: r.photos_count ?? media.length,
    photoLabel: `${cityName} — ${r.photos_count ?? media.length} photos`,
    publicRemarks: r.public_remarks ?? undefined,
    // derived scalars off `raw` (established pattern) — absent for rows
    // replicated before the school fields joined the sync SELECT; detail
    // pages then supplement via trestle getListingSchools()
    schools: schoolsFromReso((r.raw as Record<string, unknown>) ?? undefined),
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

function applyFilters(query: any, f: SearchFilters, opts?: { skipCity?: boolean }) {
  const statuses = f.statuses?.length ? f.statuses : DEFAULT_STATUSES;
  query = query.in("standard_status", statuses);

  // HOME searches default to residential property types — vacant land
  // (PropertyType='Land', the 0-bed/0-bath tracts) never appears unless
  // the visitor is on /land or explicitly picks the Land type filter.
  // Farms WITH a residence are PropertyType='Residential' in RESO and
  // stay in; house-less ranchland is 'Land' and stays out. Pure decision
  // in lib/mls/feature-search.ts (tested).
  const homeTypes = defaultPropertyTypes(f);
  if (homeTypes) query = query.in("property_type", homeTypes);

  if (opts?.skipCity) {
    // radius mode: the bounding box replaces the city clause on purpose —
    // "within 10 mi of Denton" should cross city lines
  } else if (f.citySlug) {
    const city = cityBySlug[f.citySlug];
    query = query.eq("city", city ? city.name : f.citySlug);
  } else if (f.school || f.district || f.land) {
    // School / district / LAND search is metro-wide: it must return EVERY
    // match in the ingested inventory (the 8 DFW counties), including rural
    // parcels and municipalities with no editorial city profile (Corinth,
    // Copper Canyon, …). So no 90-city restriction — the specific clauses
    // below are the filter, and the store is already county-bounded.
  } else {
    // default browse keeps its curated DFW scope (the 90 city profiles)
    query = query.in("city", dfwCities.map((c) => c.name));
  }
  if (f.minPrice != null) query = query.gte("list_price", f.minPrice);
  if (f.maxPrice != null) query = query.lte("list_price", f.maxPrice);
  if (f.minBeds != null) query = query.gte("beds", f.minBeds);
  if (f.minBaths != null) query = query.gte("baths", f.minBaths);
  if (f.minSqft != null) query = query.gte("living_area", f.minSqft);
  if (f.maxSqft != null) query = query.lte("living_area", f.maxSqft);
  if (f.newBuildsOnly) query = query.gte("year_built", 2024);
  // FEATURE search (/homes/<feature>) — 0023 generated columns from the
  // structured feed fields, never remarks matching. Each rides its own
  // partial/btree index. openHousesOnly is NOT here: it has no column and
  // is applied as a key-set intersection in search()/searchMapPins().
  if (f.pool) query = query.eq("has_private_pool", true);
  if (f.garageMin != null) query = query.gte("garage_spaces", f.garageMin);
  if (f.singleStory) query = query.eq("levels", "One");
  if (f.residentialOnly) query = query.eq("property_type", "Residential");
  // acreage bounds OUTSIDE land mode (on-acreage HOMES ride the same
  // lot_size/LotSizeAcres column; /land keeps its own clause below)
  if (!f.land) {
    if (f.minAcres != null) query = query.gte("lot_size", f.minAcres);
    if (f.maxAcres != null) query = query.lte("lot_size", f.maxAcres);
  }
  if (f.q) {
    // full-text search over the generated search_tsv column (0008) —
    // the old 3-column ilike detoasted every row's remarks and rode the
    // statement-timeout line. websearch syntax: plain words, quoted
    // phrases, OR, minus-exclusion.
    const term = f.q.replace(/[():|&!*<>\\]/g, " ").trim();
    if (term) query = query.textSearch("search_tsv", term, { type: "websearch" });
  }
  // School filter — matches the MLS-reported school for the chosen level
  // against the indexed generated columns (migration 0016), so it's fast
  // ACROSS every city: a school crosses city lines (Guyer High serves homes
  // in Denton, Lantana, AND Argyle), and the old single-city scope hid most
  // of them. `raw` is never selected/exposed — only these derived scalars.
  // Not a zoning claim — see school-fields.ts. Skipped only in the geo path,
  // where radius/polygon already ride a slim column projection.
  if (f.school && !opts?.skipCity) {
    const col =
      f.schoolLevel === "elementary"
        ? "elementary_school"
        : f.schoolLevel === "middle"
        ? "middle_school"
        : "high_school";
    const token = schoolMatchToken(f.school);
    if (token) query = query.ilike(col, `%${token}%`);
  }
  // District filter — matches the MLS-reported district in ANY of the three
  // indexed district columns (0017), so a listing that reports the same
  // district across several fields is still returned once (single-row OR).
  // City-independent (a district crosses city lines). Exact case-insensitive
  // match on the canonical value; the value is double-quoted so commas/dots
  // in a district name can't break the PostgREST or() grammar.
  if (f.district && !opts?.skipCity) {
    const v = f.district.replace(/["\\%]/g, " ").trim();
    if (v) {
      query = query.or(
        [
          `high_school_district.ilike."${v}"`,
          `middle_school_district.ilike."${v}"`,
          `elementary_school_district.ilike."${v}"`,
        ].join(",")
      );
    }
  }

  // LAND search (/land) — only genuine land listings (PropertyType='Land';
  // there is no 'Farm' PropertyType in this feed). Category maps to the exact
  // observed PropertySubTypes; acreage rides LotSizeAcres (lot_size, 99.8%
  // populated). Houses/condos/townhomes can never leak in — they are not
  // property_type='Land'.
  if (f.land) {
    query = query.eq("property_type", "Land");
    // scope to the 8 DFW-metro counties: the replica also holds a few hundred
    // out-of-scope rows pulled in by City-name collisions (Bossier LA,
    // Lafayette AR, Hunt, Parker, …). A specific f.county overrides this.
    if (!f.county) query = query.in("county", dfwCountyNames);
    if (f.landCategory) query = query.in("property_sub_type", subtypesForCategory(f.landCategory));
    if (f.minAcres != null) query = query.gte("lot_size", f.minAcres);
    if (f.maxAcres != null) query = query.lte("lot_size", f.maxAcres);
  }
  // county filter (land toolbar; feed CountyOrParish stored in `county`)
  if (f.county && !opts?.skipCity) query = query.eq("county", f.county);

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

/* Shared slim geo path for search() — radius and polygon both ride it:
   slim bounding-box prefilter (cheap btree-able range on lat/lon, no wide
   rows) paged in 1,000-row chunks (PostgREST caps every response — big
   shapes silently undercount otherwise), exact shape membership + sort
   mirrored in JS, then full rows fetched for just the page by key and
   reordered by rank. Crosses city lines by design (skipCity). Capped at
   12,000 candidates — a 25mi box over Dallas fits. */
async function geoSlimSearch(
  db: any,
  filters: SearchFilters,
  box: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  inShape: (r: any) => boolean,
  label: string,
  page: number,
  pageSize: number
): Promise<{ data: any[]; count: number }> {
  const boxRows: any[] = [];
  for (let p = 0; p < 12; p++) {
    let slim = db
      .from("listings")
      .select("listing_key, latitude, longitude, list_price, living_area, days_on_market, modification_timestamp");
    slim = applyFilters(slim, filters, { skipCity: true });
    const { data: chunk, error } = await slim
      .gte("latitude", box.minLat)
      .lte("latitude", box.maxLat)
      .gte("longitude", box.minLon)
      .lte("longitude", box.maxLon)
      .not("latitude", "is", null)
      .order("listing_key")
      .range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(`local provider (${label}): ${error.message}`);
    boxRows.push(...(chunk ?? []));
    if (!chunk || chunk.length < 1000) break;
  }

  const hits = boxRows.filter(inShape);
  const num = (v: any, fallback: number) => (v == null ? fallback : Number(v));
  hits.sort((a: any, b: any) => {
    switch (filters.sort) {
      case "price-asc":
        return num(a.list_price, Infinity) - num(b.list_price, Infinity);
      case "price-desc":
        return num(b.list_price, -1) - num(a.list_price, -1);
      case "sqft-desc":
        return num(b.living_area, -1) - num(a.living_area, -1);
      default: {
        const d = num(a.days_on_market, Infinity) - num(b.days_on_market, Infinity);
        return d !== 0 ? d : String(b.modification_timestamp).localeCompare(String(a.modification_timestamp));
      }
    }
  });
  const keys = hits.slice((page - 1) * pageSize, page * pageSize).map((r: any) => r.listing_key);
  if (!keys.length) return { data: [], count: hits.length };
  const full = await db.from("listings").select(SELECT).in("listing_key", keys);
  if (full.error) throw new Error(`local provider (${label} rows): ${full.error.message}`);
  const rank = new Map(keys.map((k: string, i: number) => [k, i]));
  const data = (full.data ?? []).sort(
    (a: any, b: any) => (rank.get(a.listing_key) ?? 0) - (rank.get(b.listing_key) ?? 0)
  );
  return { data, count: hits.length };
}

/* ---- open-house feature search (/homes/open-houses) --------------------
   No open-house column exists in the replica (events are a separate live
   resource), so the predicate is a KEY-SET INTERSECTION: the cached index
   of future structured events × the replica's on-market rows with every
   other filter applied. Counts are exact (the full intersection is
   assembled, then paged in JS). */

const cachedOpenHouseIndex = unstable_cache(
  () => getFutureOpenHouseIndex(),
  ["open-house-index"],
  { revalidate: 3600 }
);

const OH_CHUNK = 150;

function compareRows(sort: SortKey | undefined) {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return (a: any, b: any): number => {
    if (sort === "price-asc" || sort === "price-desc") {
      const pa = num(a.list_price);
      const pb = num(b.list_price);
      if (pa == null) return 1;
      if (pb == null) return -1;
      return sort === "price-asc" ? pa - pb : pb - pa;
    }
    if (sort === "sqft-desc") {
      const sa = num(a.living_area);
      const sb = num(b.living_area);
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sb - sa;
    }
    // newest: days_on_market asc nulls last, then modification_timestamp desc
    const da = num(a.days_on_market);
    const dbb = num(b.days_on_market);
    if (da != null || dbb != null) {
      if (da == null) return 1;
      if (dbb == null) return -1;
      if (da !== dbb) return da - dbb;
    }
    return String(b.modification_timestamp ?? "").localeCompare(String(a.modification_timestamp ?? ""));
  };
}

async function openHouseSearch(db: any, filters: SearchFilters, page: number, pageSize: number): Promise<SearchResult> {
  const idx = await cachedOpenHouseIndex();
  if (!idx.keys.length)
    return { listings: [], total: 0, page, pageSize, mlsLastUpdated: new Date().toISOString() };

  // chunked PK lookups (PostgREST .in has URL limits) with every OTHER
  // filter applied server-side — city/status/price/etc. still hold
  const chunks: string[][] = [];
  for (let i = 0; i < idx.keys.length; i += OH_CHUNK) chunks.push(idx.keys.slice(i, i + OH_CHUNK));
  const rows: any[] = [];
  const PARALLEL = 6;
  for (let i = 0; i < chunks.length; i += PARALLEL) {
    const batch = await Promise.all(
      chunks.slice(i, i + PARALLEL).map((chunk) => {
        let q = db.from("listings").select(SELECT);
        q = applyFilters(q, filters);
        return q.in("listing_key", chunk);
      })
    );
    for (const res of batch) {
      if (res.error) throw new Error(`local provider (open houses): ${res.error.message}`);
      rows.push(...(res.data ?? []));
    }
  }

  rows.sort(compareRows(filters.sort));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const listings = pageRows.map((r) => {
    const l = toListing(r);
    const next = idx.nextByKey[r.listing_key];
    if (next) l.openHouses = [next]; // soonest event — cards can show the window
    return l;
  });
  return {
    listings,
    total: rows.length, // exact: the full intersection was assembled above
    page,
    pageSize,
    mlsLastUpdated:
      rows.map((r) => r.modification_timestamp).sort().at(-1) ?? new Date().toISOString(),
  };
}

async function search(filters: SearchFilters): Promise<SearchResult> {
  const db = getSupabaseAdmin();
  if (!db) return { listings: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, mlsLastUpdated: new Date().toISOString() };
  const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : DEFAULT_PAGE_SIZE;
  const page = filters.page && filters.page > 0 ? filters.page : 1;

  if (filters.openHousesOnly) return openHouseSearch(db, filters, page, pageSize);

  let data: any[] | null;
  let count: number | null;

  const polygon: LonLat[] | undefined =
    filters.polygon && filters.polygon.length >= 3 ? filters.polygon : undefined;
  const center: LonLat | undefined =
    filters.center ??
    (filters.radiusMiles && filters.citySlug ? (cityBySlug[filters.citySlug]?.ll as LonLat) : undefined);

  if (polygon) {
    /* Polygon search (drawn map boundary): the prefilter box is the
       polygon's bounds and membership is exact point-in-polygon. Takes
       precedence over radius; skips the city clause — a drawn boundary
       crosses cities on purpose. */
    const res = await geoSlimSearch(
      db,
      filters,
      polygonBounds(polygon),
      (r: any) =>
        r.longitude != null && r.latitude != null && pointInPolygon([r.longitude, r.latitude], polygon),
      "polygon",
      page,
      pageSize
    );
    data = res.data;
    count = res.count;
  } else if (filters.radiusMiles && center) {
    /* Radius search: bounding-box prefilter, exact Haversine refine. */
    const res = await geoSlimSearch(
      db,
      filters,
      boundingBox(center, filters.radiusMiles),
      (r: any) => milesBetween(center, [r.longitude, r.latitude]) <= filters.radiusMiles!,
      "radius",
      page,
      pageSize
    );
    data = res.data;
    count = res.count;
  } else if (filters.q) {
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

/* ---- map pins (slim payload for the live map panel) ---- */

/** Compact pin for the map: key, lat, lon, price, beds, baths, address, city,
    plus land scalars (acreage/subtype/county) so a land popup can be
    land-aware without a second query. */
export type MapPin = {
  k: string;
  lat: number;
  lon: number;
  p: number;
  b: number;
  ba: number;
  a: string;
  c: string;
  /** LotSizeAcres (land popups) */
  ac?: number;
  /** raw PropertySubType (land popups) */
  st?: string;
  /** CountyOrParish (land popups) */
  co?: string;
};

/** Hard cap on pins returned to the map — keeps payloads and the map sane. */
export const MAP_PIN_CAP = 5000;

/* The feed contains garbage coordinates (13 rows with the minus sign
   missing from longitude — Fort Worth homes "in China" — and a few
   out-of-region latitudes). Pins are clamped to the DFW region so one bad
   row can't poison the map's fitBounds. Exported for the map-pins route's
   bbox clamp. */
export const DFW_BOUNDS = { minLat: 31.5, maxLat: 34.5, minLon: -99, maxLon: -95.5 };

type LatLonBox = { minLat: number; maxLat: number; minLon: number; maxLon: number };

function intersectBoxes(a: LatLonBox, b: LatLonBox): LatLonBox {
  return {
    minLat: Math.max(a.minLat, b.minLat),
    maxLat: Math.min(a.maxLat, b.maxLat),
    minLon: Math.max(a.minLon, b.minLon),
    maxLon: Math.min(a.maxLon, b.maxLon),
  };
}

const PIN_SELECT =
  "listing_key, latitude, longitude, list_price, beds, baths, unparsed_address, city, days_on_market, lot_size, property_sub_type, county";

function toPin(r: any): MapPin {
  return {
    k: r.listing_key,
    lat: Number(r.latitude),
    lon: Number(r.longitude),
    p: Number(r.list_price ?? 0),
    b: r.beds ?? 0,
    ba: Number(r.baths ?? 0),
    a: r.unparsed_address || "Address withheld",
    c: r.city || "",
    ac: r.lot_size != null ? Number(r.lot_size) : undefined,
    st: r.property_sub_type ?? undefined,
    co: r.county ?? undefined,
  };
}

/** Map-pin search: same filter semantics as search(), but a slim projection
    only (never raw/remarks/media). Pins are capped at MAP_PIN_CAP ordered by
    days_on_market ascending (nulls last); `total` is the full filtered count
    so the client can say "5,000 of 12,148 on the map". Rows without
    coordinates are dropped — they can't sit on a map.

    opts.bbox is a viewport hint (NOT part of SearchFilters): it narrows the
    lat/lon ranges by intersection so panning/zooming fetches only visible
    pins. The prefilter box is always DFW_BOUNDS ∩ shape box ∩ bbox —
    polygon takes precedence over radius, and both skip the city clause
    (a drawn boundary / radius crosses city lines on purpose). */
export async function searchMapPins(
  filters: SearchFilters,
  opts?: { bbox?: LatLonBox }
): Promise<{ pins: MapPin[]; total: number }> {
  const db = getSupabaseAdmin();
  if (!db) return { pins: [], total: 0 };

  const polygon: LonLat[] | undefined =
    filters.polygon && filters.polygon.length >= 3 ? filters.polygon : undefined;
  const center: LonLat | undefined =
    filters.center ??
    (filters.radiusMiles && filters.citySlug ? (cityBySlug[filters.citySlug]?.ll as LonLat) : undefined);
  const radius: number | undefined = !polygon && filters.radiusMiles && center ? filters.radiusMiles : undefined;

  let box: LatLonBox = { ...DFW_BOUNDS };
  if (polygon) box = intersectBoxes(box, polygonBounds(polygon));
  else if (radius && center) box = intersectBoxes(box, boundingBox(center, radius));
  if (opts?.bbox) box = intersectBoxes(box, opts.bbox);
  // empty intersection (viewport off to the side of the shape/region)
  if (box.minLat >= box.maxLat || box.minLon >= box.maxLon) return { pins: [], total: 0 };

  const geoOpts = polygon || radius ? { skipCity: true } : undefined;

  /* PostgREST caps every response at 1,000 rows — fire the 5 disjoint pages
     that can fill MAP_PIN_CAP IN PARALLEL. Each page carries the same
     deterministic order (days_on_market asc nulls-last, then listing_key)
     so the ranges are stable and the concat stays globally sorted. A short
     page marks the end of the box's data. */
  const PAGE = 1000;
  const pages = await Promise.all(
    [0, 1, 2, 3, 4].map((i) => {
      let slim = db.from("listings").select(PIN_SELECT);
      slim = applyFilters(slim, filters, geoOpts);
      return slim
        .gte("latitude", box.minLat)
        .lte("latitude", box.maxLat)
        .gte("longitude", box.minLon)
        .lte("longitude", box.maxLon)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("days_on_market", { ascending: true, nullsFirst: false })
        .order("listing_key")
        .range(i * PAGE, i * PAGE + PAGE - 1);
    })
  );
  const rows: any[] = [];
  let sawEnd = false;
  for (const res of pages) {
    if (res.error) throw new Error(`local provider (map pins): ${res.error.message}`);
    rows.push(...(res.data ?? []));
    if ((res.data ?? []).length < PAGE) {
      sawEnd = true; // later pages are past the end — nothing more to concat
      break;
    }
  }

  /* JS refine: exact shape membership on the box candidates (order is
     preserved, so no re-sort needed). */
  let refined = polygon
    ? rows.filter(
        (r: any) =>
          r.latitude != null && r.longitude != null && pointInPolygon([r.longitude, r.latitude], polygon)
      )
    : radius && center
      ? rows.filter(
          (r: any) =>
            r.latitude != null && r.longitude != null && milesBetween(center, [r.longitude, r.latitude]) <= radius
        )
      : rows;

  /* Open-house pages: intersect with the cached future-event key set (no
     column exists — same predicate the rail uses, so map and rail agree). */
  if (filters.openHousesOnly) {
    const idx = await cachedOpenHouseIndex();
    const ohKeys = new Set(idx.keys);
    refined = refined.filter((r: any) => ohKeys.has(r.listing_key));
  }

  const pins = refined.slice(0, MAP_PIN_CAP).map(toPin);

  /* A short page means the parallel fetch saw the whole box — the refined
     length IS the exact total. */
  if (sawEnd || filters.openHousesOnly) return { pins, total: refined.length };

  /* Truncated at 5,000 candidates: head-count the box instead. For polygon
     and radius this is the BOX count — an upper-bound approximation of the
     true shape count (exactness would need paging the entire box). */
  let head = db.from("listings").select("listing_key", { count: "exact", head: true });
  head = applyFilters(head, filters, geoOpts);
  const counted = await head
    .gte("latitude", box.minLat)
    .lte("latitude", box.maxLat)
    .gte("longitude", box.minLon)
    .lte("longitude", box.maxLon);
  // the count only feeds the chip's "OF N" — a timeout here must degrade
  // to the lower bound, never 500 the whole pins payload (map goes blank)
  if (counted.error) {
    console.warn(`local provider (map pins count, non-fatal): ${counted.error.message || "no message"}`);
    return { pins, total: refined.length };
  }
  return { pins, total: counted.count ?? refined.length };
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
    // hot path on every /homes render — memoize per instance for 60s
    // (counts move on the 15-min sync cadence anyway)
    if (countsMemo && Date.now() - countsMemo.at < 60_000) return countsMemo.value;
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
    countsMemo = { at: Date.now(), value: out };
    return out;
  },
};

let countsMemo: { at: number; value: Record<string, number> } | null = null;
