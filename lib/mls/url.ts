/* URL query string <-> SearchFilters. Dependency-free and client-safe —
   the toolbar and server pages share one serialization so a URL always
   means the same search. Params: city, min, max, beds, baths, minsqft,
   maxsqft, type, status, new, sort, page, q (keywords). */
import type { ListingStatus, PropertyType, SearchFilters, SortKey } from "./types";

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
  return params.toString();
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
  if (f.q) parts.push(`“${f.q}”`);
  return parts.join(" · ");
}
