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
| 7 | Accounts — Supabase Auth (magic link + Google) + Postgres shelf/searches/leads with RLS, guest-shelf merge | ✅ fully live in production — Vercel envs, leads → DB, Google OAuth, and Resend SMTP (signin@discoverdfw.com, delivery verified); site canonical is www.discoverdfw.com |
| 8 | Persistent saved listings — `saved_listings` schema, API routes, change-detection badges, seen-sync | ✅ |
| 9 | Alerts — price-drop / status-change / open-house digests via Vercel Cron + Resend | ✅ |
| 10 | Saved searches — full schema, API routes, standing-orders cards with cadence + email controls, guest gating | ✅ |
| 11 | **Trestle IDX Plus provider — live NTREIS inventory** (`lib/mls/trestle.ts`), real photos, real coordinates on the map, live market snapshots, ISR; SEO flip + sitemap + Search Console followed | ✅ |
| 12 | **Lead capture** — `lead_events` / `showing_requests` / `listing_questions` tables, dedicated API routes, sheets wired for real, prefill for members, honeypot + dwell-time spam guard | ✅ |
| 13 | **Lead notification emails** — branded guide heads-up + submitter confirmation per lead, attempt logging to `lead_events`, dev dry-run gating, env docs (`.env.example`) | ✅ |
| Next | Saved-search alert digests (wire saved_searches frequency/email_enabled/last_notified_at into the sweep), unsubscribe/preference links, The Letter, CRM webhook, compare view | ⬜ |

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

### Phase 7 notes — accounts

- **Stack**: Supabase Auth + Postgres via `@supabase/supabase-js` +
  `@supabase/ssr`. New-style keys: publishable (public-by-design, RLS is
  the boundary) in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; secret key in
  server-only `SUPABASE_SECRET_KEY` (leads intake only, guarded by the
  `server-only` package in `lib/db/admin.ts`). `.env*` gitignored;
  `.env.example` documents the shape. Same three vars go into Vercel
  before this deploys.
- **Schema**: `supabase/migrations/0001_accounts.sql` — `profiles`
  (trigger-created on signup), `saved_homes` (PK user+listing, keeps
  `price_at_save`), `saved_searches` (replayable `filters` jsonb),
  `leads` (no client policies; secret-key inserts only). RLS on
  everything, owner-scoped.
- **Flows**: AuthModal sends a magic link (`signInWithOtp`) with a
  "the key is in the post" sent-state; Google OAuth enabled (needs the
  provider switched on in the dashboard); `/auth/callback` exchanges the
  code; `middleware.ts` refreshes session cookies. No hard-protected
  routes — guest-first stands; dashboards render guest/member variants
  and gain SIGN OUT.
- **Guest merge**: on first SIGNED_IN, the localStorage shelf upserts
  into Postgres with `ignoreDuplicates` (existing account rows win, so
  price-cut math keeps the earliest `price_at_save`), searches insert,
  then the local copy clears (gate memory kept). Signed-in reads/writes
  go straight to the DB; signed-out returns to a fresh guest shelf.
- **Degradation**: without env vars the whole stack falls back to the
  Phase-1 local stub (modal included) — deploys never hard-depend on
  the backend. Free-tier magic-link email is rate-limited (~2/hr per
  address); wire custom SMTP (Resend/Postmark) before real users.

### Phase 8 notes — persistent saved listings

- **Schema** (`supabase/migrations/0002_saved_listings.sql`): the table is
  now `saved_listings` — `id` (uuid PK), `user_id`, `listing_key`
  (unique per user), `created_at`, `price_at_save` (kept — anchors
  "price cut since you saved"), `source_page`, `notes` (nullable),
  `last_seen_status` / `last_seen_price` (nullable — anchor "since you
  last looked" badges and future alerts). Owner-scoped RLS recreated as
  `saved_listings_all_own`; no cross-user reads possible.
- **API routes** (`/api/saved-listings`): GET list · POST save
  (idempotent upsert; stamps price/status/source page) · DELETE
  `?key=` unsave · PATCH bulk seen-updates ·
  `/api/saved-listings/merge` POST adopts the guest shelf on first
  sign-in (`ignoreDuplicates` — account rows win). All routes use the
  cookie-bound server client, so RLS enforces ownership even if a route
  had a bug; guests get 401 and never call them.
- **Client**: `ShelfProvider` routes account saves through the API;
  guests stay pure-localStorage (now also recording `sourcePage`).
  `SaveListingButton` passes the listing's current status; unsave works
  from cards, the dossier gallery heart, and the dashboard heart/CLEAR.
- **Dashboard**: still key-driven (off-market rows degrade to
  NO LONGER AVAILABLE + CLEAR); adds a STATUS: X → Y chip when
  `last_seen_status` differs from the feed, shows `notes` when present,
  and after rendering PATCHes the observed price/status so next visit
  compares against today.

#### Manual test steps (Phase 8)

1. **Guest save** — fresh browser (or clear the `ddfw.shelf.v1`
   localStorage key), visit `/homes`, ♡ a card → toast, heart fills;
   DevTools → Application → localStorage shows the save with
   `sourcePage: "/homes"`. Network tab shows NO `/api/saved-listings`
   calls. Reload — the save persists.
2. **Guest unsave** — ♥ again → toast "Removed", localStorage entry
   gone. Save one back for step 4.
3. **Login** — SIGN IN → email link or Google, same browser.
4. **Migration** — after landing signed-in, `/account/saved-homes`
   shows the guest-saved home; localStorage `saved` is now empty
   (adopted); the row exists in `saved_listings` with your `user_id`,
   `source_page`, and `last_seen_price`.
5. **Authenticated save/unsave** — ♡ another home: Network shows
   POST `/api/saved-listings` 200; unsave from (a) the card heart,
   (b) the listing page gallery heart, (c) the dashboard heart — each
   fires DELETE and the dashboard/nav counts stay consistent.
6. **Off-market handling** — with a save whose listing left the feed
   (or a hand-inserted fake key), the dashboard shows the dashed
   NO LONGER AVAILABLE row with CLEAR instead of crashing.
7. **Change badges** — set `last_seen_status` to another value on one
   row (SQL editor) → dashboard shows STATUS: … → … once, then clears
   after the seen-sync PATCH on the next reload.
8. **Isolation** — in a second browser/incognito with a different
   account, `/account/saved-homes` is empty and GET
   `/api/saved-listings` returns only that user's rows (RLS).

### Phase 10 notes — saved searches

- **Schema** (`0004_saved_searches.sql`): `saved_searches` gains
  `city_slug`, `email_enabled` (default true), `updated_at`,
  `last_notified_at`; `frequency` normalized + constrained to
  `instant | daily | weekly | off`. Owner-scoped RLS from 0001 stands.
- **API** (`/api/saved-searches`): GET list · POST create · PATCH
  (name/frequency/emailEnabled, bumps `updated_at`) · DELETE `?id=` ·
  `/merge` adopts legacy pre-gate guest searches on first sign-in.
  Cookie session + RLS; guests get 401.
- **Gating**: standing orders are server-side only now —
  `SaveSearchButton` sends guests to the account gate instead of
  saving locally (legacy guest searches still merge on login). The
  button also shows ✓ SEARCH SAVED when the current query string is
  already saved.
- **Dashboard**: `SavedSearchCard` (name, city chip, query line,
  `SavedSearchFrequencySelector` pills, ✉ EMAIL ON/OFF toggle,
  RUN → `/homes?<queryString>`, REMOVE) with member and guest empty
  states. Preferences are stored only — search alert emails are the
  next phase (the alerts sweep will read `frequency`/`email_enabled`/
  `last_notified_at`).

### Phase 9 notes — alerts

- **Detection**: `/api/alerts/run` (guarded by `CRON_SECRET`; Vercel
  Cron daily at 13:00 UTC / 8am CT per `vercel.json`) sweeps every
  `saved_listings` row on the admin client (system job — RLS still
  guards all client surfaces), compares against the provider, and
  advances the `last_seen_*` baselines so nothing double-fires:
  price drop (below `last_seen_price`; increases move the baseline
  silently), status change (vs `last_seen_status`, including
  left-the-feed → OffMarket), open house (next upcoming signature
  `date|window` vs `last_seen_open_house` — migration 0003). Null
  baselines are seeded silently on first sweep, so pre-existing saves
  never spam.
- **Log**: every alert lands in the `alerts` table (RLS: owner
  SELECT only; system-only writes) with `emailed_at` — the future
  in-app feed reads from here.
- **Email**: one digest per user per run via the Resend API
  (`lib/email/resend.ts`, `RESEND_API_KEY`, from
  `alerts@discoverdfw.com`), field-guide styled, one row per alert,
  linking to the listing and the shelf. `profiles.alerts_opt_out` is
  the kill switch. No key → logs instead of sending.
- **Feed**: `Listing.openHouses` added (RESO OpenHouse simplified);
  mock data carries open houses on the OPEN SAT/SUN listings and the
  Lakewood Tudor; the dossier facts ledger shows an OPEN HOUSE tile.
- **Test**: seed a baseline above/behind the feed in SQL (e.g.
  `update saved_listings set last_seen_price = 999999, last_seen_status = 'Pending', last_seen_open_house = null`)
  then `curl -H "Authorization: Bearer $CRON_SECRET" .../api/alerts/run`
  → response counts, `alerts` rows, one digest in the inbox; a second
  run returns zero (baselines advanced).

### Phase 12 notes — lead capture

- **Tables** (migration `0005_lead_capture.sql`): `lead_events`
  (user_id nullable / session_id nullable / event_type / listing_key /
  city_slug / source_page / metadata jsonb / created_at),
  `showing_requests` (requested_day date, requested_time_window,
  showing_mode `in_person|live_video`, name, email, phone?, message?,
  status default `new`), `listing_questions` (question, name, email,
  phone?, status default `new`). All three: RLS enabled, NO policies —
  service-role writes only (same posture as `leads`); anon can neither
  read nor write.
- **Routes**: `POST /api/showing-requests`, `POST /api/listing-questions`
  — validate, resolve optional session user (guests stay null), insert
  via `getSupabaseAdmin()`, then `recordLeadEvent()` (event_type
  `showing_request` / `listing_question`). Shared helpers in `lib/leads.ts`.
- **Spam guard, deliberately simple**: hidden honeypot field + minimum
  3-second dwell between sheet open and submit. Bots get `{ok:true}` and
  nothing stored — no CAPTCHA, no third-party script.
- **Sheets**: `RequestShowingSheet` (day picker → request, "A local guide
  will confirm."), `AskQuestionSheet` ("one guide, not a lead list" —
  name/email always, phone when TEXT ME). Both prefill name/email from
  the shelf account (Google `full_name` now carried on `ShelfAccount`),
  share `LeadSuccessState`, and send `sessionId` (`lib/session-id.ts`,
  localStorage uuid) + `sourcePage` for the event trail.
- **Email**: no new sends by default. `notifyGuide()` emails a heads-up
  through the existing Resend helper ONLY when `LEAD_NOTIFY_EMAIL` is set.
- **Showing request ≠ booking** — wording throughout is request/confirm.
- Legacy `POST /api/leads` stays for the account-signup event; the sheets
  no longer use it.

### Phase 13 notes — lead notification emails

- **Provider**: Resend (already live for auth SMTP + alert digests) —
  no new vendor. All mail from `alerts@discoverdfw.com` on the verified
  discoverdfw.com domain.
- **Env** (documented in `.env.example`): `RESEND_API_KEY` (server-only
  sending key), `LEAD_NOTIFY_EMAIL` (owner/broker/team inbox — unset
  skips guide notifications, user confirmations still send),
  `EMAIL_SEND_IN_DEV` (outside production ALL emails dry-run — logged,
  not sent — unless this is `1`; keeps tests from emailing real people).
- **Module**: `lib/email/lead-emails.ts` — brand shell shared with the
  alert digest (cream/ink/orange, serif headline, mono eyebrow, inline
  styles only), four templates: guide showing / guide question (with
  `Reply-To` set to the lead so replying reaches them directly) and the
  two submitter confirmations ("Consider it requested — a local guide
  will confirm" / "Good question — one guide, not a lead list").
- **Ordering contract**: lead row stores FIRST, then emails; the send
  path never throws, so a dead mailbox can't fail the form.
- **Failure logging**: every attempt lands in `lead_events` as
  `email_sent` / `email_failed` with `{category, to, subject, dryRun,
  error}` metadata — "did the guide hear about lead X?" is a SQL query.
  No new table needed.
- **Compliance**: both emails are transactional (direct response to a
  user-initiated request) — no unsubscribe link required under
  CAN-SPAM; footers state exactly why the recipient got the note.
  Marketing-adjacent sends (saved-search digests, The Letter) WILL need
  the preference/unsubscribe layer below before shipping.
- **Test strategy**: dev submits run the full path with dry-run sends —
  assert `lead_events` gains `email_sent` rows with `dryRun: true` and
  no real delivery; production verified via Resend dashboard logs after
  deploy. Validation/spam paths never reach the email layer.

### Phase 14 plan — saved-search digests + preferences (not yet built)

- **Digest job**: extend the daily sweep (or a second cron) to run each
  `saved_searches` row with `email_enabled` and frequency due
  (`instant` → future webhook tier; `daily`/`weekly` → compare
  `last_notified_at`), query the provider for listings newer than the
  last run (`listDate`/first-seen), send a Ledger-style digest through
  the same brand shell, then advance `last_notified_at`.
- **Unsubscribe/preferences**: signed one-click token link in every
  digest footer (`/api/email/unsubscribe?token=…` flipping
  `email_enabled` off + a `/account/saved-searches` deep link for finer
  control); `List-Unsubscribe` header for Gmail/Yahoo one-click
  compliance. Required before any recurring send.
- **Sender split**: keep `alerts@` for account-triggered mail; add
  `letter@` for editorial sends when The Letter ships.

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

## Phase 11 notes — Trestle IDX Plus provider (live NTREIS)

- `lib/mls/trestle.ts` (server-only): OAuth2 client-credentials token cached
  in module scope (8 h expiry), OData queries against
  `api-trestle.corelogic.com/trestle/odata` with Next fetch-cache
  revalidation (search 15 min, city counts 30 min, snapshots 60 min — well
  inside the 12 h IDX staleness ceiling). Credentials: `TRESTLE_API_ID` /
  `TRESTLE_API_PASSWORD`, switched on with `MLS_PROVIDER=trestle`.
- Feed facts (probed 2026-07-06): ~47k active for-sale Residential across
  the feed; DOM lives in `CumulativeDaysOnMarket` (`DaysOnMarket`,
  `ListingContractDate`, `OnMarketDate` are withheld); rentals share
  `Property` as `PropertyType eq 'ResidentialLease'` (always excluded);
  photo `MediaURL`s are public CDN links; `$apply` aggregation unsupported;
  `$top` max ≥1000; `in (…)` filters work; `ComingSoon` unused by NTREIS.
- Every query is scoped to the curated 53 cities (`City in (…)`), so each
  listing always maps to a real `/city/[slug]` page.
- Type buckets: toolbar offers Single family / Townhome / Condo /
  Multi-family / Land (`PROPERTY_TYPE_OPTIONS`); mapped to
  `PropertySubType` / `PropertyType` clauses.
- `getActiveCountsByCity()` added to the provider contract — 53 tiny
  `$count` queries (chunked 12 at a time) replace the old 500-listing pull
  in MapRoom and city pages; mock provider counts in memory.
- City snapshots compute real `medianListPrice`, `pricePerSqft`, and
  `medianDaysOnMarket` from up to 1,000 actives; editorial tagline/ISD/YoY
  stay from the dataset.
- Open houses fetched per listing detail (date-bounded — the feed contains
  garbage dates like year 7025); OPEN SAT/SUN badge when the next one lands
  within 7 days.
- UI: Ledger cards + Dossier gallery render real `<img>` photos
  (plain img, not next/image — optimization quota can't cover 47k
  listings), map pins sit on real listing coordinates, NTREIS attribution
  ("Listing courtesy of …") + IDX disclaimer replace the reserved
  placeholders, mock-inventory banners hidden when `isLiveMls`.
- Listing detail: `generateStaticParams` empty in live mode; pages render
  on demand with `revalidate = 900`. `getListingByKey` rejects non-numeric
  (mock) keys so stale shelf rows can't hit the feed.
- Search surfaces remain `noindex` until production is eyeballed — flipping
  indexing + sitemap is the explicit next step.
