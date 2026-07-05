/* MLS module entry: provider factory + URL <-> filter helpers.

   getMlsProvider() is SERVER-SIDE ONLY. Phase 4 adds:
     case "trestle": return trestleProvider
   backed by TRESTLE_CLIENT_ID / TRESTLE_CLIENT_SECRET — server-only env
   names (no NEXT_PUBLIC_ prefix); credentials must never reach the browser.
   Client components import URL helpers from ./url (or via this re-export
   type-only) — never the provider. */
import type { MlsProvider } from "./provider";
import { mockProvider } from "./mock-provider";

export type * from "./types";
export type { MlsProvider } from "./provider";
export {
  parseSearchFilters,
  searchFiltersToQueryString,
  searchFiltersLabel,
  STATUS_BY_SLUG,
  SLUG_BY_STATUS,
} from "./url";

export function getMlsProvider(): MlsProvider {
  switch (process.env.MLS_PROVIDER) {
    case "mock":
    default:
      return mockProvider;
  }
}
