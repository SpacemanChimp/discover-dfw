# MLS Search — Build Plan

The field-guide voice carried into MLS search: cities first, listings second.
Design source of truth: the Claude Design bundle (`Search Screens.dc.html`,
`Search Prototype.dc.html`) — referenced, never pasted into production.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Search product on mock data — Map Room, Dossier, My Shelf, lead capture | ✅ shipped to `mls-search-phase-1` |
| 2 | Shared MLS types + mock provider (`lib/mls`, `data/`) | ✅ this change |
| 3 | Real accounts (Auth.js magic link + Google), DB-backed shelf/searches, alerts, CRM wiring for `/api/leads` | ⬜ |
| 4 | Trestle IDX Plus provider, photo CDN, ISR, flip search surfaces to indexable | ⬜ |

## Architecture

- **Server-first**: pages call an `MlsProvider` (server-side only) and pass
  plain objects down; filters live in the URL query string so every search is
  shareable, back-button friendly, and server-rendered.
- **Client islands**: toolbar, map pins, hearts/shelf (localStorage), sheets.
- **One data layer**: `lib/mls` is canonical. The Phase-1 `lib/listings`
  module was folded into it and deleted.

```
lib/mls/types.ts          Listing, ListingMedia, ListingStatus, PropertyType,
                          CityMarketSnapshot, SearchFilters, SearchResult,
                          SavedHome, SavedSearchFilter
lib/mls/provider.ts       MlsProvider interface (the contract)
lib/mls/mock-provider.ts  mock implementation + load-time data validation
lib/mls/index.ts          getMlsProvider() factory, URL <-> filter helpers
data/mock-listings.ts     12 fictional listings, full Listing shape
data/dfw-cities.ts        bridge to the editorial city dataset + snapshots
```

## Provider contract

```ts
interface MlsProvider {
  searchListings(filters: SearchFilters): Promise<SearchResult>;
  getListingByKey(listingKey: string): Promise<Listing | null>;
  getListingsByCity(citySlug: string): Promise<Listing[]>;
  getFeaturedListings(citySlug?: string, limit?: number): Promise<Listing[]>;
  getCityMarketSnapshot(citySlug: string): Promise<CityMarketSnapshot | null>;
}
```

Selected by `MLS_PROVIDER` env (`mock` default). Phase 4 adds
`case "trestle"` backed by `TRESTLE_CLIENT_ID` / `TRESTLE_CLIENT_SECRET` —
server-only names, no `NEXT_PUBLIC_` prefix, never imported client-side.

## Data model notes

- Field names track the RESO Data Dictionary (ListingKey, ListingId,
  StandardStatus, ListPrice, BedroomsTotal→bedsTotal, LivingArea→
  livingAreaSqft, DaysOnMarket, PublicRemarks, UnparsedAddress) so Trestle's
  RESO Web API maps 1:1.
- `editorialNote` is ours (the field-guide line); `publicRemarks` is the
  feed's. Cards render `editorialNote`.
- `media[]` carries caption slots with `url: null` until the photo CDN;
  `photoLabel` is the primary caption shortcut the placeholder slots render.
- `originalListPrice` powers PRICE CUT math; `SavedHome.priceAtSave` powers
  "price cut since you saved" on the shelf.
- Compliance slots on every listing: `listingBrokerName`,
  `listingOfficeName`, `mlsSource`, `mlsLastUpdated`, `attributionText`,
  `disclaimerText`. `MLSAttribution` renders the reserved line until the
  feed fills them; `MLSComplianceFooter` shows the refresh timestamp.

## Validation

No test runner in the repo, so the mock provider validates its data at
module load (unique keys, known city slugs, positive figures, primary media,
PRICE CUT ⇒ originalListPrice, parseable dates) and **throws during
`next build`** on violations — the build is the test. When a test runner
lands, these become unit tests over `searchListings` filter mechanics.

## Compliance guardrails (standing)

- All `/homes`, `/city/[slug]/homes`, `/listing/*`, `/account/*` routes are
  `noindex` and excluded from the sitemap while inventory is fictional.
  Flip alongside the Trestle provider in Phase 4, not before.
- Reserved NTREIS text blocks live in `MLSComplianceFooter`; TREC IABS +
  Consumer Protection Notice links ride along on every search surface.

## Trestle notes for Phase 4

- RESO Web API (OData): `Property` resource filtered to the IDX-permitted
  set; map `Media` expansion into `ListingMedia[]`.
- OAuth2 client-credentials token cached server-side; requests only from
  the provider module (route handlers / server components).
- Swap SSG listing pages to ISR (`revalidate` ~15 min) and honor
  `mlsLastUpdated` from `ModificationTimestamp`.
- Fill `attributionText`/`disclaimerText` exactly as NTREIS display rules
  dictate before removing the "reserved" placeholders.
