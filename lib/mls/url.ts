/* URL query string <-> SearchFilters. Dependency-free and client-safe —
   the toolbar and server pages share one serialization so a URL always
   means the same search. Params: city, min, max, beds, baths, minsqft,
   maxsqft, type, status, new, sort, page, q (keywords), r (radius miles),
   poly (drawn boundary, "lon,lat;lon,lat;…"). */
import type { ListingStatus, PropertyType, SearchFilters, SortKey } from "./types";
import { parsePolygon, serializePolygon } from "./geo";
import { isLandCategory } from "@/lib/land/land";

const SORT_KEYS: SortKey[] = ["newest", "price-asc", "price-desc", "sqft-desc"];

export const STATUS_BY_SLUG: Record<string, ListingStatus> = {
  active: "Active",
  "active-under-contract": "ActiveUnderContract",
  "coming-soon": "ComingSoon",
  pending: "Pending",
  closed: "Closed",
  withdrawn: "Withdrawn",
};

export const SLUG_BY_STATUS = Object.fromEntries(
  Object.entries(STATUS_BY_SLUG).map(([slug, status]) => [status, slug])
) as Record<ListingStatus, string>;

export function parseSearchFilters(
  params: Record<string, string | string[] | undefined>
): SearchFilters {
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const num = (k: string) => {
    const v = one(k);
    if (!v) return undefined;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const floatNum = (k: string) => {
    const v = one(k);
    if (!v) return undefined;
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const sort = one("sort") as SortKey | undefined;
  const status = STATUS_BY_SLUG[one("status") ?? ""];
  return {
    citySlug: one("city") || undefined,
    minPrice: num("min"),
    maxPrice: num("max"),
    minBeds: num("beds"),
    minBaths: num("baths"),
    minSqft: num("minsqft"),
    maxSqft: num("maxsqft"),
    propertyType: (one("type") as PropertyType) || undefined,
    statuses: status ? [status] : undefined,
    newBuildsOnly: one("new") === "1" || undefined,
    sort: sort && SORT_KEYS.includes(sort) ? sort : undefined,
    page: num("page"),
    q: (one("q") || "").trim().slice(0, 120) || undefined,
    // School is a standalone, city-independent filter (0016): it matches the
    // MLS-reported school across every city via the indexed generated columns,
    // so it needs no city context to be safe or fast.
    school: (one("school") || "").trim().slice(0, 120) || undefined,
    schoolLevel: (["elementary", "middle", "high"] as const).includes(
      (one("slevel") as "elementary" | "middle" | "high") ?? ("" as never)
    )
      ? (one("slevel") as "elementary" | "middle" | "high")
      : undefined,
    // District is a standalone, city-independent filter (0017): matches the
    // MLS-reported school district across any of the three district fields.
    district: (one("district") || "").trim().slice(0, 120) || undefined,
    // land search (/land): land flag + acreage/category/county
    land: one("land") === "1" || undefined,
    landCategory: isLandCategory(one("cat")) ? (one("cat") as SearchFilters["landCategory"]) : undefined,
    minAcres: floatNum("minac"),
    maxAcres: floatNum("maxac"),
    county: (one("county") || "").trim().slice(0, 40) || undefined,
    radiusMiles: [5, 10, 15, 25].includes(num("r") ?? 0) ? num("r") : undefined,
    // invalid poly strings parse to undefined silently — junk URLs just
    // fall back to the non-polygon search
    polygon: parsePolygon(one("poly") ?? ""),
  };
}

export function searchFiltersToQueryString(f: SearchFilters, omitCity = false): string {
  const params = new URLSearchParams();
  if (!omitCity && f.citySlug) params.set("city", f.citySlug);
  if (f.minPrice) params.set("min", String(f.minPrice));
  if (f.maxPrice) params.set("max", String(f.maxPrice));
  if (f.minBeds) params.set("beds", String(f.minBeds));
  if (f.minBaths) params.set("baths", String(f.minBaths));
  if (f.minSqft) params.set("minsqft", String(f.minSqft));
  if (f.maxSqft) params.set("maxsqft", String(f.maxSqft));
  if (f.propertyType) params.set("type", f.propertyType);
  if (f.statuses?.[0]) params.set("status", SLUG_BY_STATUS[f.statuses[0]]);
  if (f.newBuildsOnly) params.set("new", "1");
  if (f.sort) params.set("sort", f.sort);
  if (f.q) params.set("q", f.q);
  // school is city-independent now (0016): a school crosses city lines, so
  // the filter serializes on its own — with or without a city context.
  if (f.school) {
    params.set("school", f.school);
    if (f.schoolLevel) params.set("slevel", f.schoolLevel);
  }
  // district (0017) — city-independent, serializes on its own
  if (f.district) params.set("district", f.district);
  // land search params
  if (f.land) params.set("land", "1");
  if (f.landCategory) params.set("cat", f.landCategory);
  if (f.minAcres) params.set("minac", String(f.minAcres));
  if (f.maxAcres) params.set("maxac", String(f.maxAcres));
  if (f.county) params.set("county", f.county);
  if (f.radiusMiles) params.set("r", String(f.radiusMiles));
  if (f.polygon?.length) params.set("poly", serializePolygon(f.polygon));
  return params.toString();
}

/* Honest noun for a result total. The default search spans four on-market
   statuses (Active/AUC/ComingSoon/Pending), so it is NOT "active homes" —
   only an Active-only filter earns "ACTIVE LISTINGS". */
export function resultScopeLabel(
  statuses?: ListingStatus[]
): { noun: string; note?: string } {
  const s = statuses ?? [];
  if (s.length === 1) {
    if (s[0] === "Active") return { noun: "ACTIVE LISTINGS" };
    const words = s[0].replace(/([A-Z])/g, " $1").trim().toUpperCase();
    return { noun: `${words} LISTINGS` };
  }
  // default combined on-market scope (or an explicit multi-status set)
  return { noun: "MATCHING LISTINGS", note: "ACTIVE + OTHER ON-MARKET STATUSES" };
}

export function searchFiltersLabel(f: SearchFilters, cityName?: string): string {
  const parts: string[] = [cityName || "All of DFW"];
  if (f.minBeds) parts.push(`${f.minBeds}+ bd`);
  if (f.minBaths) parts.push(`${f.minBaths}+ ba`);
  if (f.minPrice && f.maxPrice)
    parts.push(`$${Math.round(f.minPrice / 1000)}K–$${Math.round(f.maxPrice / 1000)}K`);
  else if (f.maxPrice) parts.push(`≤ $${f.maxPrice.toLocaleString("en-US")}`);
  else if (f.minPrice) parts.push(`≥ $${f.minPrice.toLocaleString("en-US")}`);
  if (f.propertyType) parts.push(f.propertyType);
  if (f.statuses?.[0]) parts.push(f.statuses[0].replace(/([A-Z])/g, " $1").trim().toLowerCase());
  if (f.newBuildsOnly) parts.push("new construction");
  if (f.school) parts.push(`served by ${f.school}`);
  if (f.district) parts.push(`in ${f.district}`);
  if (f.q) parts.push(`“${f.q}”`);
  if (f.radiusMiles) parts.push(`within ${f.radiusMiles} mi`);
  if (f.polygon?.length) parts.push("custom area");
  return parts.join(" · ");
}
