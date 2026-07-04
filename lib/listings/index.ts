/* Listing provider factory. SERVER-SIDE ONLY — never import from client
   components; pages fetch here and pass plain Listing objects down.

   Phase 3 adds:
     case "trestle": return trestleProvider
   backed by TRESTLE_CLIENT_ID / TRESTLE_CLIENT_SECRET (server-only env vars —
   no NEXT_PUBLIC_ prefix, credentials must never reach the browser). */
import type { ListingProvider, SearchQuery } from "./types";
import { mockProvider } from "./mock-provider";

export function getListingProvider(): ListingProvider {
  switch (process.env.LISTING_PROVIDER) {
    case "mock":
    default:
      return mockProvider;
  }
}

/* ---- URL query string <-> SearchQuery (filters live in the URL) ---- */
export function parseSearchQuery(params: Record<string, string | string[] | undefined>): SearchQuery {
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
  const sort = one("sort");
  return {
    citySlug: one("city") || undefined,
    minPrice: num("min"),
    maxPrice: num("max"),
    minBeds: num("beds"),
    propertyType: one("type") || undefined,
    newBuildsOnly: one("new") === "1" || undefined,
    sort: sort === "price-asc" || sort === "price-desc" || sort === "newest" ? sort : undefined,
  };
}

export function searchQueryLabel(q: SearchQuery, cityName?: string): string {
  const parts: string[] = [cityName || "All of DFW"];
  if (q.minBeds) parts.push(`${q.minBeds}+ bd`);
  if (q.minPrice && q.maxPrice) parts.push(`$${Math.round(q.minPrice / 1000)}K–$${Math.round(q.maxPrice / 1000)}K`);
  else if (q.maxPrice) parts.push(`≤ $${q.maxPrice.toLocaleString("en-US")}`);
  else if (q.minPrice) parts.push(`≥ $${q.minPrice.toLocaleString("en-US")}`);
  if (q.propertyType) parts.push(q.propertyType);
  if (q.newBuildsOnly) parts.push("new construction");
  return parts.join(" · ");
}
