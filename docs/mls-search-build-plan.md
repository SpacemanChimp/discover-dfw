# MLS Search — Build Plan

The field-guide voice carried into MLS search: cities first, listings second.
Design source of truth: the Claude Design bundle (`Search Screens.dc.html`,
`Search Prototype.dc.html`) — referenced, never pasted into production.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Search product scaffold on mock data — Map Room, Dossier, My Shelf, lead capture | ✅ |
| 2 | Shared MLS types + mock provider (`lib/mls`, `data/`) | ✅ |
| 3 | `/homes` search page hardened on the provider — component extraction (rail / map panel / mobile index / empty / loading), baths + status filters, mock-inventory banner | ✅ |
| 4 | City-specific home search pages — dedicated `/city/[slug]/homes` layout | ✅ |
| 5 | Listing detail pages — Dossier decomposed, gallery, branded 404, sticky mobile CTAs | ✅ |
| 6 | Guest saved homes — Broadsheet cards, empty state, off-market ("No longer available") handling | ✅ |
| Next | Real accounts (Auth.js magic link + Google), DB-backed shelf/searches, alerts, CRM wiring for `/api/leads` | ⬜ |
| Final | Trestle IDX Plus provider, photo CDN, ISR, flip search surfaces to indexable | ⬜ |

### Phase 3 notes

- `/homes` (and `/city/[slug]/homes`) compose `SearchToolbar`,
  `CitySearchHeader`, `ListingResultsRail`, `ListingCardLedger`,
  `SearchMapPanel` (illustrated placeholder for the IDX parcel map — pins on
  city centroids), `MobileCitySearchIndex`, `EmptyResultsState`,
  `LoadingState` (route-level `loading.tsx`), `MLSAttribution`.
- Query params: `city, min, max, beds, baths, type, status, new, sort, page`
  — parsed and serialized by one shared module (`lib/mls/url.ts`, client-safe)
  so toolbar URLs and server parsing can never drift.
- Mobile defaults to the city index; the map is never the required first
  interaction.
- Save buttons remain fully functional (guest localStorage shelf shipped in
  Phase 1) — no persistence beyond the device, no auth.
- A dashed "SAMPLE INVENTORY — FICTIONAL UNTIL MLS APPROVAL" banner sits
  under the toolbar on every search surface, alongside the standing
  compliance footer.

### Phase 4 notes

- `/city/[slug]/homes` is now a dedicated city-first page (the metro Map
  Room stays at `/homes`): `CityHomesHero` (county eyebrow, active-count
  chip, READ THE FULL CITY REPORT → `/city/[slug]`, OPEN THE MAP ROOM →
  `/homes?city=…`), `CityMarketMiniSnapshot` (consumes
  `getCityMarketSnapshot` — editorial placeholder figures + provider
  count), `CityHomesList` (Ledger-card grid with the group-level
  `MLSAttribution` reservation beneath), `CityHomesEmptyState` (suggests
  same-county cities with inventory, then all of DFW).
- Editorial city reports (section 07 — On the Market) now link to
  SEARCH {CITY} HOMES; the homes page links back, so the report ↔ search
  loop is closed.
- The city-scoped `SearchToolbar` rides along, so filters + the
  SAVE THIS SEARCH button work identically here (guest shelf; DB
  persistence still deferred to the saved-search phase).
- `MLSAttribution` gained a group mode (no `listingId`) for beneath
  listing groups: "LISTINGS COURTESY OF PARTICIPATING BROKERAGES — IDX
  ATTRIBUTION RESERVED · SOURCE: PLACEHOLDER — PENDING MLS APPROVAL".

### Phase 5 notes

- `ListingDetailDossier` is now a server component composed of:
  `ListingPhotoGallery` (collage placeholder from `media[]` captions —
  primary + two secondary slots + "+N" chip; heart overlay),
  `ListingFactsLedger` (DOM, $/sqft, type, year, status, list date, lot,
  original price when cut), `ListingCityContext` (vs-median bar, city
  report + city homes links), `ListingLeadCTA` (client island holding
  the sheets).
- Compliance reservations on every dossier: per-listing attribution,
  MLS source, LAST UPDATED timestamp, and a DISCLAIMER RESERVED line
  (renders `disclaimerText` verbatim when the live feed supplies it).
- Branded 404 at `app/listing/[listingKey]/not-found.tsx` ("OFF THE
  LEDGER") with routes back to the search and the shelf.
- Mobile: the Request a Showing / Ask a Question bar is sticky at the
  viewport bottom (`.dossier-ctas`). The sheets remain fully wired to
  `/api/leads` from Phase 1 — kept functional rather than regressed to
  placeholder modals.
- `badgeStyle`/`money` moved to directive-free
  `components/search/format.ts` so server components can share them.

### Phase 6 notes

- The guest save loop shipped in Phase 1 and stands: `SaveListingButton`
  → `ShelfProvider` (the "SavedHomesProvider" — `lib/shelf.tsx`,
  localStorage key `ddfw.shelf.v1`) → "Saved — on your shelf." toast →
  one-time "Keep it safe." soft gate → dismissible, guest-first.
- The dashboard is now driven by the saved KEYS rather than the
  inventory: `SavedListingCardBroadsheet` renders each save, and when a
  saved listing has left the feed it degrades to a dashed
  NO LONGER AVAILABLE row (saved date + price at save + CLEAR) grouped
  under OFF THE MARKET — counts always match the nav pill, nothing
  silently vanishes, nothing crashes.
- `SavedHomesEmptyState` extracted as the named first-run state.
- Still guest-only by design: no real auth, no DB. The membership modal
  remains the Phase-1 email stub.

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
