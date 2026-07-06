/* MLS module entry: provider factory + URL <-> filter helpers.

   getMlsProvider() is SERVER-SIDE ONLY. Phase 4 adds:
     case "trestle": return trestleProvider
   backed by TRESTLE_CLIENT_ID / TRESTLE_CLIENT_SECRET — server-only env
   names (no NEXT_PUBLIC_ prefix); credentials must never reach the browser.
   Client components import URL helpers from ./url (or via this re-export
   type-only) — never the provider. */
import type { MlsProvider } from "./provider";
import type { PropertyType } from "./types";
import { mockProvider } from "./mock-provider";
import { trestleProvider } from "./trestle";
import { localProvider } from "./local";

export type * from "./types";
export type { MlsProvider } from "./provider";
export {
  parseSearchFilters,
  searchFiltersToQueryString,
  searchFiltersLabel,
  STATUS_BY_SLUG,
  SLUG_BY_STATUS,
} from "./url";

/** True when the site is serving real NTREIS inventory (live API or the
    replicated local store) — gates indexing, banners, compliance copy. */
export const isLiveMls = ["trestle", "local", "database"].includes(process.env.MLS_PROVIDER ?? "");

/** Toolbar HOME TYPE options — the buckets the live feed can filter on. */
export const PROPERTY_TYPE_OPTIONS: PropertyType[] = [
  "Single family",
  "Townhome",
  "Condo",
  "Multi-family",
  "Land",
];

export function getMlsProvider(): MlsProvider {
  switch (process.env.MLS_PROVIDER) {
    case "trestle":
      return trestleProvider;
    case "local":
    case "database": // alias — reads the replicated Postgres store
      return localProvider;
    case "mock":
    default:
      return mockProvider;
  }
}
