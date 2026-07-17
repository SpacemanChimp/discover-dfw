/* Trestle IDX Plus provider — live NTREIS inventory over the RESO Web API
   (OData). SERVER-ONLY: credentials come from TRESTLE_API_ID /
   TRESTLE_API_PASSWORD and must never reach the browser; the `server-only`
   import makes a client bundle inclusion a build error.

   Field mapping follows what the feed actually returns (probed 2026-07-06):
   days-on-market lives in CumulativeDaysOnMarket (DaysOnMarket is null),
   ListingContractDate/OnMarketDate are withheld from the IDX feed, rentals
   share the Property resource under PropertyType 'ResidentialLease', and
   photo URLs are public CDN links.

   Every query is scoped to the curated 53-city dataset so each listing maps
   to a real /city/[slug] page — the feed itself covers all of North Texas. */
import "server-only";
// Compliance copy — single source of truth, PENDING BROKER/NTREIS/LEGAL REVIEW
import { attributionLine, DEEMED_RELIABLE_DISCLAIMER, MLS_SOURCE } from "@/lib/compliance";
import type { MlsProvider } from "./provider";
import type {
  Listing,
  ListingBadge,
  ListingMedia,
  ListingStatus,
  OpenHouse,
  PropertyType,
  SearchFilters,
  SearchResult,
  SortKey,
} from "./types";
import { dfwCities, cityBySlug, cityMarketSnapshot, dfwCountyNames } from "@/data/dfw-cities";
import { boundingBox, polygonBounds, type LonLat } from "./geo";
import { RESO_SCHOOL_FIELDS, schoolsFromReso, schoolMatchToken } from "./school-fields";
import { subtypesForCategory } from "@/lib/land/land";
import type { ListingSchools } from "./types";

import { TRESTLE_ODATA_BASE_URL, TRESTLE_TOKEN_URL, trestleCredentials } from "./trestle-env";

const TOKEN_URL = TRESTLE_TOKEN_URL;
const API_BASE = TRESTLE_ODATA_BASE_URL;
const DEFAULT_PAGE_SIZE = 24;

/* Cache windows (seconds). NTREIS IDX rules require data no staler than
   12 hours; we stay far inside that. */
const REVALIDATE_SEARCH = 900;
const REVALIDATE_COUNTS = 1800;
const REVALIDATE_SNAPSHOT = 3600;
/* school fields change ~never during a listing's life — cache long */
const REVALIDATE_SCHOOLS = 21600;


/* Statuses shown when the visitor doesn't filter — everything except sold.
   (NTREIS doesn't populate ComingSoon in this feed; harmless to include.) */
const DEFAULT_STATUSES: ListingStatus[] = ["Active", "ActiveUnderContract", "ComingSoon", "Pending"];

const CITY_BY_NAME = new Map(dfwCities.map((c) => [c.name.toLowerCase(), c]));

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const SELECT = [
  "ListingKey", "ListingId", "StandardStatus", "ListPrice", "OriginalListPrice",
  "BedroomsTotal", "BathroomsTotalInteger", "LivingArea", "LotSizeAcres", "YearBuilt",
  "PropertyType", "PropertySubType", "UnparsedAddress", "City", "CountyOrParish", "PostalCode",
  "SubdivisionName", "Latitude", "Longitude", "PhotosCount", "CumulativeDaysOnMarket",
  "ModificationTimestamp", "ListOfficeName", "PublicRemarks", "NewConstructionYN",
  ...RESO_SCHOOL_FIELDS,
].join(",");

/* ---- auth ---- */

let tokenCache: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;
  const creds = trestleCredentials();
  if (!creds)
    throw new Error(
      "Trestle credentials missing: set TRESTLE_API_ID/TRESTLE_API_PASSWORD (or TRESTLE_CLIENT_ID/TRESTLE_CLIENT_SECRET)"
    );
  // no explicit cache option: POSTs are never data-cached, and `no-store`
  // would force dynamic rendering — which 500s ISR listing pages
  const res = await Promise.race([
    fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: creds.id, client_secret: creds.secret, scope: "api" }),
    }),
    new Promise<Response>((_, rej) =>
      setTimeout(() => rej(new Error("Trestle token timed out")), 10_000)
    ),
  ]);
  if (!res.ok) throw new Error(`Trestle token request failed: ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

/* A sick/throttled feed HANGS rather than erroring — unbounded, that hang
   propagates into ISR page renders (open houses fetch live per detail
   view). Race instead of AbortSignal: a signal opts the fetch out of
   Next's data cache; the race just abandons the promise so callers can
   degrade (open houses -> none). */
const TRESTLE_TIMEOUT_MS = 8_000;
function rejectAfter<T>(ms: number): Promise<T> {
  return new Promise((_, rej) =>
    setTimeout(() => rej(new Error(`Trestle timed out after ${ms}ms`)), ms)
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function odata(query: string, revalidate: number): Promise<any> {
  const token = await getToken();
  const res = await Promise.race([
    fetch(`${API_BASE}/${query}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      next: { revalidate },
    }),
    rejectAfter<Response>(TRESTLE_TIMEOUT_MS),
  ]);
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`Trestle OData ${res.status}: ${body}`);
  }
  return res.json();
}

/* ---- filter building ---- */

/** OData clause for our editorial property-type buckets. */
function typeClause(t: PropertyType | undefined): string {
  switch (t) {
    case "Land":
      return "PropertyType eq 'Land'";
    case "Multi-family":
      return "PropertyType eq 'ResidentialIncome'";
    case "Townhome":
      return "PropertyType eq 'Residential' and PropertySubType eq 'Townhouse'";
    case "Condo":
    case "High-rise condo":
      return "PropertyType eq 'Residential' and PropertySubType eq 'Condominium'";
    case "Single family":
      return "PropertyType eq 'Residential' and PropertySubType eq 'SingleFamilyResidence'";
    case undefined:
      // for-sale inventory only — the feed mixes rentals into Property
      return "PropertyType in ('Residential','ResidentialIncome','Land')";
    default:
      // editorial style names (Bungalow, Tudor, …) only exist in mock data
      return "PropertyType eq 'Residential' and PropertySubType eq 'SingleFamilyResidence'";
  }
}

function buildFilter(f: SearchFilters): string {
  // /land restricts to genuine land; otherwise the editorial type buckets
  const parts: string[] = [f.land ? "PropertyType eq 'Land'" : typeClause(f.propertyType)];

  const statuses = f.statuses?.length ? f.statuses : DEFAULT_STATUSES;
  parts.push(`StandardStatus in (${statuses.map(q).join(",")})`);

  const center: LonLat | undefined =
    f.center ?? (f.radiusMiles && f.citySlug ? (cityBySlug[f.citySlug]?.ll as LonLat) : undefined);
  if (f.polygon && f.polygon.length >= 3) {
    // drawn boundary — bounding-box approximation, same as radius below
    // (fallback provider only; local does the exact point-in-polygon).
    // Takes precedence over radius/city like the local provider.
    const box = polygonBounds(f.polygon);
    parts.push(
      `Latitude ge ${box.minLat} and Latitude le ${box.maxLat} and Longitude ge ${box.minLon} and Longitude le ${box.maxLon}`
    );
  } else if (f.radiusMiles && center) {
    // OData geo functions aren't supported by the feed — bounding-box
    // approximation (fallback provider only; local does the exact circle)
    const box = boundingBox(center, f.radiusMiles);
    parts.push(
      `Latitude ge ${box.minLat} and Latitude le ${box.maxLat} and Longitude ge ${box.minLon} and Longitude le ${box.maxLon}`
    );
  } else if (f.citySlug) {
    const city = cityBySlug[f.citySlug];
    parts.push(`City eq ${q(city ? city.name : f.citySlug)}`);
  } else if (f.school || f.district || f.land) {
    // metro-wide school / district / land search — bound to the 8 DFW counties
    // (the ingestion scope), NOT the 90 curated cities, so rural parcels and
    // out-of-roster matches (Corinth, etc.) are included
    parts.push(`CountyOrParish in (${dfwCountyNames.map(q).join(",")})`);
  } else {
    parts.push(`City in (${dfwCities.map((c) => q(c.name)).join(",")})`);
  }

  if (f.minPrice != null) parts.push(`ListPrice ge ${f.minPrice}`);
  if (f.maxPrice != null) parts.push(`ListPrice le ${f.maxPrice}`);
  if (f.minBeds != null) parts.push(`BedroomsTotal ge ${f.minBeds}`);
  if (f.minBaths != null) parts.push(`BathroomsTotalInteger ge ${f.minBaths}`);
  if (f.minSqft != null) parts.push(`LivingArea ge ${f.minSqft}`);
  if (f.maxSqft != null) parts.push(`LivingArea le ${f.maxSqft}`);
  if (f.newBuildsOnly) parts.push("(NewConstructionYN eq true or YearBuilt ge 2024)");
  // Land — category (PropertySubType), acreage (LotSizeAcres), county
  if (f.land) {
    if (f.landCategory) {
      const subs = subtypesForCategory(f.landCategory);
      if (subs.length) parts.push(`PropertySubType in (${subs.map(q).join(",")})`);
    }
    if (f.minAcres != null) parts.push(`LotSizeAcres ge ${f.minAcres}`);
    if (f.maxAcres != null) parts.push(`LotSizeAcres le ${f.maxAcres}`);
  }
  if (f.county) parts.push(`CountyOrParish eq ${q(f.county)}`);
  // School — match the MLS-reported name in the level-specific field (parity
  // with the local provider; not a zoning claim).
  if (f.school) {
    const field =
      f.schoolLevel === "elementary"
        ? "ElementarySchool"
        : f.schoolLevel === "middle"
        ? "MiddleOrJuniorSchool"
        : "HighSchool";
    const token = schoolMatchToken(f.school);
    if (token) parts.push(`contains(${field},${q(token)})`);
  }
  // District — match in ANY of the three district fields (one row, one match).
  if (f.district) {
    const d = f.district;
    parts.push(
      `(contains(HighSchoolDistrict,${q(d)}) or contains(MiddleOrJuniorSchoolDistrict,${q(d)}) or contains(ElementarySchoolDistrict,${q(d)}))`
    );
  }
  if (f.q) {
    const term = f.q.trim(); // q() handles quote escaping
    if (term)
      parts.push(
        `(contains(PublicRemarks,${q(term)}) or contains(UnparsedAddress,${q(term)}) or contains(SubdivisionName,${q(term)}))`
      );
  }

  return parts.join(" and ");
}

function orderBy(sort: SortKey | undefined): string {
  switch (sort) {
    case "price-asc":
      return "ListPrice asc";
    case "price-desc":
      return "ListPrice desc";
    case "sqft-desc":
      return "LivingArea desc";
    case "newest":
    default:
      return "CumulativeDaysOnMarket asc,ModificationTimestamp desc";
  }
}

/* ---- mapping feed rows to our domain ---- */

function mapPropertyType(p: any): PropertyType {
  if (p.PropertyType === "Land") return "Land";
  if (p.PropertyType === "ResidentialIncome") return "Multi-family";
  switch (p.PropertySubType) {
    case "Townhouse":
      return "Townhome";
    case "Condominium":
      return "Condo";
    default:
      return "Single family";
  }
}

function mapMedia(p: any): ListingMedia[] {
  const rows: any[] = Array.isArray(p.Media) ? p.Media : [];
  return rows
    .filter((m) => m.MediaURL)
    .sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0))
    .map((m, i) => ({
      url: m.MediaURL as string,
      caption: m.ShortDescription || "",
      order: m.Order ?? i,
      isPrimary: i === 0,
    }));
}

function editorialNote(p: any, badge: ListingBadge, cityName: string, hood: string): string {
  const dom = p.CumulativeDaysOnMarket ?? 0;
  if (badge === "NEW") return `New to the ${cityName} market — day ${Math.max(dom, 1)} on the books.`;
  if (badge === "PRICE CUT" && p.OriginalListPrice)
    return `Asking $${(p.OriginalListPrice - p.ListPrice).toLocaleString("en-US")} less than it did on day one.`;
  if (p.YearBuilt) return `${hood} — a ${p.YearBuilt} build, ${dom} days on the market.`;
  return `${hood}, ${cityName} — ${dom} days on the market.`;
}

function toListing(p: any): Listing {
  const cityName: string = p.City || "";
  const known = CITY_BY_NAME.get(cityName.toLowerCase());
  const dom: number = p.CumulativeDaysOnMarket ?? 0;
  const media = mapMedia(p);
  const priceCut = p.OriginalListPrice != null && p.ListPrice != null && p.OriginalListPrice > p.ListPrice;
  const badge: ListingBadge = priceCut ? "PRICE CUT" : dom <= 7 ? "NEW" : "ACTIVE";
  const hood: string = p.SubdivisionName || cityName;

  return {
    listingKey: String(p.ListingKey),
    listingId: String(p.ListingId ?? p.ListingKey),
    standardStatus: (p.StandardStatus as ListingStatus) ?? "Active",
    badge,
    daysOnMarket: dom,
    listDate: new Date(Date.now() - dom * 86_400_000).toISOString().slice(0, 10),
    listPrice: p.ListPrice ?? 0,
    originalListPrice: priceCut ? p.OriginalListPrice : undefined,
    bedsTotal: p.BedroomsTotal ?? 0,
    bathsTotal: p.BathroomsTotalInteger ?? 0,
    livingAreaSqft: p.LivingArea ?? 0,
    lotSizeAcres: p.LotSizeAcres ?? undefined,
    yearBuilt: p.YearBuilt ?? 0,
    propertyType: mapPropertyType(p),
    unparsedAddress: p.UnparsedAddress || "Address withheld",
    citySlug: known?.slug ?? cityName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    cityName,
    county: p.CountyOrParish ?? undefined,
    landSubtype: p.PropertySubType ?? undefined,
    neighborhood: hood,
    postalCode: p.PostalCode ?? undefined,
    lonLat: p.Longitude != null && p.Latitude != null ? [p.Longitude, p.Latitude] : undefined,
    media,
    photoCount: p.PhotosCount ?? media.length,
    photoLabel: media[0]?.caption || `${cityName} — ${p.PhotosCount ?? 0} photos`,
    publicRemarks: p.PublicRemarks ?? undefined,
    schools: schoolsFromReso(p),
    editorialNote: editorialNote(p, badge, cityName, hood),
    listingBrokerName: null,
    listingOfficeName: p.ListOfficeName ?? null,
    mlsSource: MLS_SOURCE.live,
    mlsLastUpdated: p.ModificationTimestamp ?? new Date().toISOString(),
    attributionText: p.ListOfficeName ? attributionLine(p.ListOfficeName) : null,
    disclaimerText: DEEMED_RELIABLE_DISCLAIMER,
  };
}

/* ---- open houses (detail pages only — one extra query per listing) ---- */

const fmtHour = (d: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Chicago",
  }).formatToParts(d);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  const min = get("minute");
  return `${get("hour")}${min === "00" ? "" : `:${min}`}`;
};

const fmtPeriod = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: true, timeZone: "America/Chicago" })
    .formatToParts(d)
    .find((x) => x.type === "dayPeriod")?.value ?? "";

/** Exported for the local provider — open houses aren't replicated, so
    detail views fetch them live regardless of the serving provider. */
export async function getOpenHouses(listingKey: string): Promise<OpenHouse[]> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);
    // date bounds also weed out feed garbage (open houses in year 7025 exist)
    const filter = `ListingKey eq ${q(listingKey)} and OpenHouseDate ge ${today} and OpenHouseDate le ${horizon}`;
    const j = await odata(
      `OpenHouse?$filter=${encodeURIComponent(filter)}&$orderby=OpenHouseStartTime asc&$top=6`,
      REVALIDATE_SEARCH
    );
    return (j.value as any[])
      .filter((o) => o.OpenHouseStartTime && o.OpenHouseEndTime && o.OpenHouseStatus !== "Canceled")
      .map((o) => {
        const start = new Date(o.OpenHouseStartTime);
        const end = new Date(o.OpenHouseEndTime);
        return {
          date: String(o.OpenHouseDate ?? o.OpenHouseStartTime).slice(0, 10),
          window: `${fmtHour(start)}–${fmtHour(end)} ${fmtPeriod(end)}`,
        };
      });
  } catch {
    // open houses are decoration — never fail a listing page over them
    return [];
  }
}

/** Exported for the local provider path — rows replicated before the school
    fields joined the sync SELECT lack them in `raw`, so detail pages fetch
    the six fields live (tiny $select, 6h cache) until a full backfill runs.
    Degrades to null on any hiccup — never fails a listing page. */
export async function getListingSchools(listingKey: string): Promise<ListingSchools | null> {
  if (!/^\d+$/.test(listingKey)) return null; // mock keys never hit the feed
  if (!trestleCredentials()) return null;
  try {
    const query =
      `Property?$filter=${encodeURIComponent(`ListingKey eq ${q(listingKey)}`)}` +
      `&$select=${RESO_SCHOOL_FIELDS.join(",")}`;
    const j = await odata(query, REVALIDATE_SCHOOLS);
    return schoolsFromReso((j.value as any[])[0]) ?? null;
  } catch {
    return null;
  }
}

/** OPEN SAT/SUN badge when the next open house lands this weekend. */
export function openHouseBadge(openHouses: OpenHouse[]): ListingBadge | null {
  const next = openHouses[0];
  if (!next) return null;
  const diff = (Date.parse(next.date) - Date.now()) / 86_400_000;
  if (diff > 7) return null;
  const day = new Date(next.date + "T12:00:00Z").getUTCDay();
  return day === 6 ? "OPEN SAT" : day === 0 ? "OPEN SUN" : null;
}

/* ---- provider ---- */

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function search(filters: SearchFilters, mediaTop: number): Promise<SearchResult> {
  const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : DEFAULT_PAGE_SIZE;
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const query =
    `Property?$filter=${encodeURIComponent(buildFilter(filters))}` +
    `&$orderby=${encodeURIComponent(orderBy(filters.sort))}` +
    `&$top=${pageSize}&$skip=${(page - 1) * pageSize}&$count=true` +
    `&$select=${SELECT}&$expand=${encodeURIComponent(`Media($orderby=Order;$top=${mediaTop})`)}`;
  const j = await odata(query, REVALIDATE_SEARCH);
  const listings = (j.value as any[]).map(toListing);
  return {
    listings,
    total: j["@odata.count"] ?? listings.length,
    page,
    pageSize,
    mlsLastUpdated:
      listings.map((l) => l.mlsLastUpdated).sort().at(-1) ?? new Date().toISOString(),
  };
}

export const trestleProvider: MlsProvider = {
  async searchListings(filters: SearchFilters): Promise<SearchResult> {
    return search(filters, 1);
  },

  async getListingByKey(listingKey: string): Promise<Listing | null> {
    // defense: mock keys linger in old saved shelves; never query the feed for them
    if (!/^\d+$/.test(listingKey)) return null;
    const query =
      `Property?$filter=${encodeURIComponent(`ListingKey eq ${q(listingKey)}`)}` +
      `&$select=${SELECT}&$expand=${encodeURIComponent("Media($orderby=Order;$top=48)")}`;
    const j = await odata(query, REVALIDATE_SEARCH);
    const row = (j.value as any[])[0];
    if (!row) return null;
    const listing = toListing(row);
    listing.openHouses = await getOpenHouses(listingKey);
    if (listing.badge === "ACTIVE") listing.badge = openHouseBadge(listing.openHouses) ?? listing.badge;
    return listing;
  },

  async getListingsByCity(citySlug: string): Promise<Listing[]> {
    return (await search({ citySlug, statuses: ["Active"], sort: "newest", pageSize: 100 }, 1)).listings;
  },

  async getFeaturedListings(citySlug?: string, limit = 4): Promise<Listing[]> {
    const result = await search(
      { citySlug, statuses: ["Active"], sort: "newest", pageSize: Math.max(limit * 3, 12) },
      1
    );
    // prefer listings that lead with a real photo
    const withPhotos = result.listings.filter((l) => l.media[0]?.url);
    const rest = result.listings.filter((l) => !l.media[0]?.url);
    return [...withPhotos, ...rest].slice(0, limit);
  },

  async getCityMarketSnapshot(citySlug: string) {
    const city = cityBySlug[citySlug];
    if (!city) return null;
    const filter = `PropertyType eq 'Residential' and StandardStatus eq 'Active' and City eq ${q(city.name)}`;
    const j = await odata(
      `Property?$filter=${encodeURIComponent(filter)}` +
        `&$select=ListPrice,LivingArea,CumulativeDaysOnMarket&$top=1000&$count=true`,
      REVALIDATE_SNAPSHOT
    );
    const rows = j.value as any[];
    const asOf = new Date().toISOString();
    const base = cityMarketSnapshot(citySlug, j["@odata.count"] ?? rows.length, asOf);
    if (!base || rows.length < 8) return base; // tiny sample → keep editorial figures
    return {
      ...base,
      medianListPrice: median(rows.map((r) => r.ListPrice).filter((x) => x > 0)),
      pricePerSqft: Math.round(
        median(rows.filter((r) => r.ListPrice > 0 && r.LivingArea > 0).map((r) => r.ListPrice / r.LivingArea))
      ),
      medianDaysOnMarket: median(rows.map((r) => r.CumulativeDaysOnMarket).filter((x) => x != null)),
    };
  },

  async getActiveCountsByCity(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    // 53 tiny $count queries, ISR-cached; chunked to stay polite on the API
    const chunkSize = 12;
    for (let i = 0; i < dfwCities.length; i += chunkSize) {
      await Promise.all(
        dfwCities.slice(i, i + chunkSize).map(async (c) => {
          const filter = `PropertyType eq 'Residential' and StandardStatus eq 'Active' and City eq ${q(c.name)}`;
          try {
            const j = await odata(
              `Property?$filter=${encodeURIComponent(filter)}&$top=0&$count=true`,
              REVALIDATE_COUNTS
            );
            out[c.slug] = j["@odata.count"] ?? 0;
          } catch {
            out[c.slug] = 0; // one bad count shouldn't sink the whole index
          }
        })
      );
    }
    return out;
  },
};
