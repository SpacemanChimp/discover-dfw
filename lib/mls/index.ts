/* MLS module entry: provider factory + URL <-> filter helpers.

   getMlsProvider() is SERVER-SIDE ONLY. Phase 4 adds:
     case "trestle": return trestleProvider
   backed by TRESTLE_CLIENT_ID / TRESTLE_CLIENT_SECRET — server-only env
   names (no NEXT_PUBLIC_ prefix); credentials must never reach the browser. */
import type { MlsProvider } from "./provider";
import type { PropertyType, SearchFilters, SortKey } from "./types";
import { mockProvider } from "./mock-provider";

export type * from "./types";
export type { MlsProvider } from "./provider";

export function getMlsProvider(): MlsProvider {
  switch (process.env.MLS_PROVIDER) {
    case "mock":
    default:
      return mockProvider;
  }
}

/* ---- URL query string <-> SearchFilters (filters live in the URL) ---- */

const SORT_KEYS: SortKey[] = ["newest", "price-asc", "price-desc", "sqft-desc"];

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
  return {
    citySlug: one("city") || undefined,
    minPrice: num("min"),
    maxPrice: num("max"),
    minBeds: num("beds"),
    minBaths: num("baths"),
    minSqft: num("minsqft"),
    maxSqft: num("maxsqft"),
    propertyType: (one("type") as PropertyType) || undefined,
    newBuildsOnly: one("new") === "1" || undefined,
    sort: sort && SORT_KEYS.includes(sort) ? sort : undefined,
    page: num("page"),
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
  if (f.newBuildsOnly) params.set("new", "1");
  if (f.sort) params.set("sort", f.sort);
  return params.toString();
}

export function searchFiltersLabel(f: SearchFilters, cityName?: string): string {
  const parts: string[] = [cityName || "All of DFW"];
  if (f.minBeds) parts.push(`${f.minBeds}+ bd`);
  if (f.minPrice && f.maxPrice)
    parts.push(`$${Math.round(f.minPrice / 1000)}K–$${Math.round(f.maxPrice / 1000)}K`);
  else if (f.maxPrice) parts.push(`≤ $${f.maxPrice.toLocaleString("en-US")}`);
  else if (f.minPrice) parts.push(`≥ $${f.minPrice.toLocaleString("en-US")}`);
  if (f.propertyType) parts.push(f.propertyType);
  if (f.newBuildsOnly) parts.push("new construction");
  return parts.join(" · ");
}
