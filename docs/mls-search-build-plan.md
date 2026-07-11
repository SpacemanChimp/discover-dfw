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
| 14 | **Lead Desk** — `/admin/leads` behind an `ADMIN_EMAILS` allowlist; filterable lead list, detail drawer with status pills, event timeline, shelf-engagement counts | ✅ |
| 15 | **Saved-search digests + unsubscribe** — standing orders email new inventory on their cadence via the daily sweep; HMAC one-click unsubscribe + List-Unsubscribe headers | ✅ |
| 16 | **Compliance display components centralized** — all MLS/IDX copy in `lib/compliance.ts` (marked PENDING BROKER/NTREIS/LEGAL REVIEW), extracted `ListingBrokerAttribution` / `LastUpdatedStamp` / `DataDisclaimer` | ✅ |
| 17 | **Local listings schema + sync bookkeeping** — `listings` / `listing_media` / `mls_sync_runs` / `mls_sync_errors` / `city_market_snapshots` tables (migration 0006), row types in `lib/mls/db-rows.ts` | ✅ schema |
| 18 | **MLS sync job + local provider** — `/api/mls/sync` (keyset-paginated Trestle replication, backfill→incremental), `MLS_PROVIDER=local` reads Postgres | ✅ |
| 19 | **Production on the local store** — Vercel Pro: sync cron every 15 min (maxDuration 300), PRICE CUT via self-tracked price history (feed withholds OriginalListPrice), open houses fetched live per detail view, `MLS_PROVIDER=local` in production | ✅ |
| 20 | **Live market band + photo lightbox + keyword search** — snapshots gain median DOM, city pages declare live data, gallery opens a full lightbox (media cap 12→50), `q` keyword filter across all providers | ✅ |
| 21 | **Radius search + search UX** — within 5/10/15/25 mi of any city (crosses city lines), sort control, pagination, clear-filters chip, "Nearby on the market" on listing pages | ✅ |
| 22 | **Zillow-style search: real map + filter popovers + perf** — Leaflet/Carto geographic map with brand price pins over the full filtered set (`/api/map-pins`, 600 cap), PRICE / BEDS & BATHS / FILTERS popover panels with batched Apply, client router cache, counts memo | ✅ |
| 23 | **Hover photo cards + draw boundary + uncapped map** — Zillow-style hover card with photo carousel (`/api/pin-card`), freehand map boundary → `?poly=` (RDP-simplified, shared polygon search across providers), pin cap 600→5,000 with capped-viewport bbox refetch, two-layer marker renderer (static canvas dots + capped bubble overlay) | ✅ |
| 24 | **Instant search shell + mobile map + big gallery + live copy** — /homes streams (toolbar+map paint immediately, rail suspends; `unstable_cache` on rail/counts for cold lambdas), mobile MAP/LIST toggle (Leaflet survives display:none via ResizeObserver + deferred fit), pins always follow the viewport (bbox-follow mode), Zillow-class 5-photo dossier collage @1240px, placeholder copy retired behind `isLiveMls` sitewide | ✅ |
| 25 | **Mobile polish + accessibility** — WCAG contrast sweep (ink-alpha .45/.5/.55→.62, small-orange text → #C13E17), shared `useDialogA11y` (Escape/focus-trap/restore/scroll-lock) on all 5 overlays, form labels + role=alert errors + aria-pressed chips, 40px tap targets, mobile popover sheets, toggle clearance for TREC links, loading/empty skeletons on dashboards + city-homes route; **fixed: saved-homes fed mock data on the live feed** (new `/api/shelf-listings`) | ✅ |
| 26 | **90-city expansion + backfill hardening** — merged the map-labels branch (53→90 cities incl. Carrollton, Waxahachie, Garland, Richardson…; 562 static pages), full backfill to 42,220 active metro listings + 90 city snapshots; sync `?full=1` gained a resumable `?cursor=` (+ `cursorResumed` echo) and `?pagesize=`; every Trestle call race-bounded (8s); Supabase compute NANO→SMALL after the walk saturated the instance | ✅ |
| Next | ⚠ Compliance copy sign-off (broker + NTREIS/Cotality), The Letter, CRM webhook, compare view, instant-tier search alerts, optional Google-basemap swap (needs user's Maps API key + billing) | ⬜ |

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

### Phase 14 notes — the Lead Desk (/admin/leads)

- **Authorization**: no role system exists yet, so the gate is an env
  allowlist — `ADMIN_EMAILS` (comma-separated, case-insensitive),
  checked server-side in `lib/admin.ts` against the cookie session.
  Non-admins (including signed-in members) get a plain **404**, never a
  login hint; unset list = 404 for everyone. The status API returns 404
  unauthenticated for the same reason. **Upgrade path** when more
  humans need access: `role` column on `profiles` (migration), check
  role instead of the env list, manage via the desk itself.
- **Route**: `app/admin/leads/page.tsx` — `force-dynamic`,
  `noindex,nofollow`, absent from sitemap and public nav. Service-role
  reads happen strictly AFTER the gate: latest 200 showing requests +
  200 questions, last 100 lead_events, shelf counts, and
  `auth.admin.listUsers` for the email map.
- **UI**: `AdminLeadList` (filters: type / status / city / listing key /
  date range — client-side over the fetched set), `LeadDetailDrawer`
  (contact links, status pills, listing + city-report links, per-listing
  event trail), `LeadEventTimeline` (submissions + email sends/failures,
  color-coded). City comes from the lead_events trail — the lead tables
  don't carry it.
- **Status flow**: new → contacted → scheduled → closed via
  `PATCH /api/admin/leads` (admin gate + whitelist of statuses),
  optimistic UI with rollback.
- Plain, functional styling — the editorial theatrics stay public.

### Phase 15 notes — saved-search digests + unsubscribe

- **Digest pass** rides the existing daily sweep (`/api/alerts/run`,
  pass 2): every `saved_searches` row with `email_enabled` and a
  frequency other than `off` is checked; due when
  `now − (last_notified_at ?? created_at)` exceeds ~20 h (daily — and
  `instant`, until a realtime tier exists) or ~6.8 d (weekly). The
  provider runs the stored `filters` (Active, newest, top 50); listings
  with `listDate` after the baseline are "fresh"; up to 8 render in the
  digest with a "+N more" line and a Run-the-search button.
  `last_notified_at` advances ONLY after a successful send — a failed
  send retries naturally on the next sweep; a broken saved search is
  caught per-row and never sinks the sweep. `profiles.alerts_opt_out`
  is honored as the account-wide kill switch.
- **Unsubscribe** (`lib/email/unsubscribe.ts`): token =
  `searchId.HMAC-SHA256(searchId, CRON_SECRET)` — stateless,
  timing-safe verify, no table. `/api/email/unsubscribe?token=…`
  supports GET (branded confirmation page) and POST (RFC 8058
  one-click); both flip that one search's `email_enabled` off, the
  search stays saved. Every digest carries the footer link plus
  `List-Unsubscribe` / `List-Unsubscribe-Post` headers (Gmail/Yahoo
  bulk-sender rules).
- **Template** (`lib/email/search-digest.ts`): brand shell, thumbnail +
  badge/price/address/facts rows, footer states why the mail arrived +
  CHANGE CADENCE deep link.
- **Verified**: due search → `digestsSent: 1` with dry-run log; rerun →
  0 (idempotent); valid token 200 + `email_enabled=false` (GET and
  POST); tampered/missing token 400.
- **Sender split** (future): keep `alerts@` for account-triggered mail;
  add `letter@` for editorial sends when The Letter ships.

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

### Phase 16 notes — compliance display components

- **`lib/compliance.ts` is the single source of truth** for every MLS/IDX
  string on the site: source labels, the "Listing courtesy of …"
  attribution form, both disclaimers ("deemed reliable" per-listing +
  the data-source/IDX-program paragraph), the mock-mode footer text, the
  reserved-slot placeholders, and the last-updated formatter.
- ⚠ **EVERY STRING THERE IS PLACEHOLDER COPY drafted in-house** — marked
  `PENDING BROKER / NTREIS / LEGAL REVIEW` in the file header and via the
  grep-able `COMPLIANCE_COPY_STATUS` constant. The sponsoring broker and
  NTREIS/Cotality must supply or approve final required wording before
  launch is considered compliant; update it in that one file and every
  card, dossier, and footer follows. The single exception: TREC link
  labels (`components/TrecLinks.tsx`) are regulator-mandated verbatim
  (22 TAC §531.18/§531.20) and are final.
- **Components** (`components/compliance/`):
  `ListingBrokerAttribution` (courtesy line with reserved-slot fallback —
  the space never silently disappears), `LastUpdatedStamp` (CT-formatted
  refresh time + source, light/dark variants), `DataDisclaimer`
  (live vs mock paragraph). `MLSAttribution` (per-card row) and
  `MLSComplianceFooter` (disclaimer + stamp + `TrecLinks`) now compose
  them; the Trestle provider takes `attributionText`/`disclaimerText`/
  `mlsSource` from the same module.
- **Coverage**: ListingCardLedger (compact attribution row),
  ListingDetailDossier (attribution + stamp + per-listing disclaimer),
  `/homes` and `/city/[slug]/homes` (MLSComplianceFooter with TREC links
  at ≥10pt). City-report tier cards carry the courtesy line + MLS#.

### Phase 17 notes — local listings schema + sync bookkeeping

- **Why**: groundwork for a replication-based provider. Today every
  search hits Trestle live (ISR-cached 15 min); once a sync job upserts
  the feed into `listings`/`listing_media`, a "local" provider can serve
  reads from Postgres — faster pages, no per-request quota exposure,
  full-text/geo queries become possible. Nothing reads these tables yet;
  the trestle provider is untouched.
- **Tables** (migration `0006_mls_listings_schema.sql`, all RLS-enabled
  with NO policies — service-role only, the browser never touches them):
  - `listings` — keyed by RESO `listing_key`; status/price/close_price,
    beds/baths/living_area/lot_size/year_built, type + sub_type, full
    address split (street_number/street_name/unparsed_address/city/
    state/postal_code/county/subdivision), lat/lon, public_remarks,
    list_office_name, list_agent_name (only if IDX rules permit),
    originating_system_name, modification_timestamp, photos_count, and a
    server-only `raw` jsonb of the unmodified feed payload for
    debugging. `updated_at` maintained by trigger. Indexes on status,
    (city, status, price), modification desc, type, postal_code.
  - `listing_media` — ordered photos per listing_key (cascade delete),
    media_key/media_url/"order"/media_type/modification_timestamp.
  - `mls_sync_runs` — one row per sync invocation: provider, started/
    finished, status (running|success|partial|failed), records_seen/
    upserted/failed, error_summary.
  - `mls_sync_errors` — per-record failures: run_id (cascade),
    listing_key, stage (fetch|map|upsert|media), message, detail jsonb.
  - `city_market_snapshots` — daily computed stats per city:
    active_listings, median_list_price, price_per_sqft, median_dom,
    unique (city_slug, as_of).
- **Raw payloads are never public**: RLS-no-policy posture means anon/
  authenticated PostgREST access returns nothing; any future
  client-facing read path must select explicit columns, never `raw`
  (contract restated in `lib/mls/db-rows.ts`).
- **Next step** (separate phase): the sync job — cron-driven
  ModificationTimestamp-cursor replication from Trestle with
  per-run bookkeeping in `mls_sync_runs`, then a `local` MLS_PROVIDER
  implementation over these tables.

### Phase 18 notes — MLS sync job + local provider

- **`GET /api/mls/sync`** (CRON_SECRET-guarded, daily Vercel cron at
  12:30 UTC before the 13:00 alerts sweep): replicates the feed into the
  0006 tables. Self-detected modes — BACKFILL walks on-market inventory
  (Active/AUC/ComingSoon/Pending, 53 cities, for-sale types) by
  modification order and marks `backfill-complete` in `mls_sync_runs`;
  INCREMENTAL then walks WITHOUT the status filter so Pending→Closed
  flips and withdrawals reach the local rows.
- **Keyset pagination on (ModificationTimestamp, ListingKey)** — a plain
  timestamp cursor measurably dropped ~4% of records because NTREIS bulk
  jobs stamp identical millisecond timestamps across page boundaries.
  Cursor resumes from the newest (ts, key) already stored, so every
  invocation makes durable progress inside its ~42s budget.
- Manual params: `?full=1` (repair re-walk from epoch) and `?budget=ms`
  (long budgets allowed only off-Vercel — full repairs run from a dev
  machine; Vercel invocations stay capped).
- **Per-run bookkeeping** in `mls_sync_runs` (seen/upserted/failed) with
  page-level failures in `mls_sync_errors` (stage fetch/upsert/media);
  a poisoned batch upsert retries row-by-row so one bad record can't
  sink a page. Media replaced wholesale per listing (feed order is
  authoritative). `raw` stores the selected-field payload, nulls
  stripped. `city_market_snapshots` upserted per city once caught up —
  REAL medians now (e.g. Denton $417K median, $203/sqft).
- **Backfill measured**: ~28k listings + ~325k media rows in 14
  invocations (~10 min), zero failures; incremental runs pick up only
  the delta (6 records minutes later) in ~15s.
- **`MLS_PROVIDER=local`** (`lib/mls/local.ts`): full MlsProvider over
  the replicated store via the service-role client — filters/sorts as
  SQL, media embedded, snapshots/counts from `city_market_snapshots`,
  domain mapping derives scalars from `raw` (DOM) but never exposes the
  payload. Known gaps vs trestle: no open-house data, no
  originalListPrice (no PRICE CUT badge), "newest" via replicated DOM.
- ~~Production stays trestle~~ **Superseded by Phase 19** (Vercel Pro):
  sync cron runs every 15 minutes (`*/15 * * * *`, maxDuration 300 /
  240s budget), matching the old trestle ISR freshness, and production
  runs `MLS_PROVIDER=local`. Feature gaps closed:
  - PRICE CUT: the IDX feed withholds `OriginalListPrice` (verified null
    on every record — the trestle provider's badge never fired either),
    so the sync now SELF-TRACKS price history: one select per page
    compares incoming vs stored `list_price`, records
    `raw.PreviousListPrice` on movement, and carries history forward on
    no-change upserts. Badges accumulate as prices move from now on —
    something the live API could never provide.
  - Open houses fetch live from Trestle inside `getListingByKey` only
    (detail views + alert sweep — low volume, never fails the listing).
  The trestle provider remains one env var away as a fallback.
  `isLiveMls` treats `local` as live NTREIS data.

### Trestle provider spec audit (post-Phase 20)

Audited against the original "server-side Trestle provider" spec — the
implementation lives in `lib/mls/trestle.ts` (not `trestle-provider.ts`)
and satisfies it:

| Spec item | Where |
| --- | --- |
| Server-side only | `import "server-only"` — client bundling is a build error |
| Env-driven credentials, none hard-coded | `lib/mls/trestle-env.ts` — accepts `TRESTLE_API_ID`/`TRESTLE_API_PASSWORD` and the `TRESTLE_CLIENT_ID`/`TRESTLE_CLIENT_SECRET` aliases |
| `TRESTLE_TOKEN_URL` / `TRESTLE_ODATA_BASE_URL` | Optional overrides in `trestle-env.ts`; Cotality production defaults |
| OAuth client-credentials + token cache | `getToken()` — module cache until `expires_in` minus 60s |
| Safe Property/Media query helpers | `odata()` + `q()` quote-escaping + `encodeURIComponent` on every filter |
| Map to internal `Listing` | `toListing()` (RESO → domain, compliance strings from `lib/compliance`) |
| Error handling, no credentials in logs | Errors carry status + truncated body only; token failures log status only |
| Token never reaches the client | server-only module; pages pass plain `Listing` objects down |
| Server-only test utility | `node scripts/trestle-smoke.mjs [city]` — verified: lists 3 actives w/ media; without creds prints guidance and exits 2, fetching nothing |
| Graceful when env missing | Smoke script exits cleanly; provider throws a clear config error (loud by design — a misconfigured live site should not silently serve nothing); `getOpenHouses` degrades to `[]` |

### Sync job spec audit + manual runbook (post-Phase 20)

Audited against the original "MLS sync job and provider switch" spec.
Already built in Phases 17–19: the sync job, keyset incremental
replication, listing/media upserts, run/error bookkeeping, the
database-backed provider, mock mode, secret-free logs, and
manual-before-scheduled verification order. Closed by this audit:

- **`MLS_PROVIDER=database`** accepted as an alias of `local` (flag now
  reads `mock | local/database | trestle`); `isLiveMls` recognizes it.
- **`?dryrun=1`** — fetch + map + count, write NOTHING (no listings,
  media, snapshots, cursor markers). Verified: row counts identical
  before/after.
- **`?limit=N`** — stop after ~N records for small first runs.
- **`?reconcile=1`** — the "mark stale" gap: hard-deleted feed records
  never emit a status flip, so incremental sync can strand zombie
  on-market rows. Reconcile diffs all feed on-market ListingKeys against
  local rows and marks local-only ones `OffMarket`. First real run found
  and cleaned **77 zombies**; a weekly cron (Sun 12:00 UTC) now keeps it
  bounded. Composes with `dryrun`.

**Running the sync manually** (CRON_SECRET required; from repo root with
a dev server on :3111, or against production):

    SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '\r')
    BASE=http://localhost:3111        # or https://www.discoverdfw.com

    curl -H "Authorization: Bearer $SECRET" "$BASE/api/mls/sync?dryrun=1&limit=200"   # safe test
    curl -H "Authorization: Bearer $SECRET" "$BASE/api/mls/sync"                      # one normal run
    curl -H "Authorization: Bearer $SECRET" "$BASE/api/mls/sync?reconcile=1&dryrun=1" # zombie count
    curl -H "Authorization: Bearer $SECRET" "$BASE/api/mls/sync?reconcile=1"          # mark zombies
    # full repair re-walk (dev only — needs a long budget):
    curl --max-time 3600 -H "Authorization: Bearer $SECRET" "$BASE/api/mls/sync?full=1&budget=3400000"

    node scripts/trestle-smoke.mjs [city]    # credentials/endpoint smoke test

### Phase 21 notes — radius search + search UX

- **Radius engine** (`lib/mls/geo.ts` + provider paths): center resolves
  from an explicit `filters.center` or the scoped city's centroid — no
  geocoder needed. Local provider: slim bounding-box prefilter on
  lat/lon (PAGED in 1,000-row chunks — PostgREST caps single responses
  at 1,000 and a 25mi box exceeds it; unpaged it silently undercounted
  AND shrank with radius), exact Haversine circle refine + sort in JS,
  full rows fetched per page by key. Crosses city lines by design
  (verified: Denton in-town 945 → 5mi 660 → 10mi 1,664 → 25mi 9,185;
  25mi renders in ~2.3s). Trestle falls back to the bounding box (feed
  lacks OData geo functions); mock refines via centroids.
- **URL param `r`** (5|10|15|25) through the shared url module — radius
  rides saved searches and digest replays like any filter, and the
  query label gains "within N mi".
- **Toolbar UX**: WITHIN N MI select (city-scoped only), NEWEST/PRICE
  ↑↓/LARGEST sort select (the SortKey engine existed since Phase 3 with
  no UI), and a ✕ CLEAR chip when any filter is active.
- **Pagination at last**: shared `Pager` (plain links — crawlable,
  back-button friendly) on the Map Room rail and city search pages;
  visitors were previously hard-capped at 24 results.
- **"Nearby on the market"** on every listing page: 3mi radius around
  the listing's coordinates, four compact cards, degrades to nothing on
  any hiccup.

### Phase 22 notes — Zillow-style search (real map, popovers, perf)

- **Map** (`components/search/LiveMapPanel.tsx`, client): Leaflet 1.9 +
  Carto Voyager raster tiles (keyless; attribution required and
  rendered). Pins come from `GET /api/map-pins?<filters>` — a slim
  public projection (never raw/remarks/media) capped at 600, same
  filter semantics as search including q and radius; CDN-cached 5 min
  (s-maxage) while the browser fetches no-store. >250 pins render as
  canvas dots at low zoom and swap to branded price bubbles per
  viewport at zoom ≥13; popups are branded mini cards linking to
  `/listing/[key]`. Map lives ONLY in the Map Room (`/homes`) in live
  mode; the illustrated metroplex stays for mock mode and all
  editorial surfaces. Swap to a Google basemap later = one tile-layer
  change + user-supplied Maps API key/billing.
- **Feed coordinate garbage** (found during integration): 13 rows had
  the minus sign missing from longitude ("Fort Worth homes in China"),
  6 had out-of-region latitudes — one bad pin poisons fitBounds to a
  world view. Pins are clamped to a DFW bounds box server-side AND the
  sync now sign-corrects/nulls implausible coordinates on every upsert.
- **Toolbar popovers**: PRICE (min/max + band chips), BEDS & BATHS
  (pill grid), FILTERS (type/status/sqft/radius) — one navigation per
  APPLY instead of one per control; buttons show compact state
  summaries ("UNDER $400K", "3+ BD, 2+ BA", "FILTERS · 2").
- **Map Room stays the Map Room**: toolbar navigation from `/homes`
  keeps the query-param form (map persists across every filter change);
  only the dedicated `/city/[slug]/homes` pages keep their path form.
- **Perf**: measured prod warm renders 0.3–0.7s (the "slow" feel was
  full-page round trips per control change — now batched + client
  router cache via `experimental.staleTimes` + a 60s module memo on
  `getActiveCountsByCity`). Perceived speed: the map updates client-side
  from the pins API without a page reload.

### Phase 23 notes — hover cards, draw boundary, uncapped map

- **Hover photo cards**: hovering any pin (bubble or dot) opens a React
  overlay card — photo strip with ‹ › arrows + dot indicators (≤6 photos),
  PRICE CUT chip (delta from self-tracked `PreviousListPrice`), price /
  beds / baths / sqft / address, VIEW LISTING →. Fed by
  `GET /api/pin-card?k=` (slim public projection + up to 6 media URLs,
  `raw` scalar read only for the price-cut figure; s-maxage 900) with a
  module-level cache so repeat hovers never refetch. 250 ms grace timer
  lets the pointer travel pin → card; card flips below the pin near the
  top edge; touch: first tap opens, map tap closes; Escape closes.
- **Draw boundary**: ✏ DRAW BOUNDARY arms a pointer-capture overlay
  (dragging/scroll-zoom paused, crosshair + hint chip); the freehand
  gesture draws a live dashed polyline, on release is RDP-simplified
  (≤30 pts, 4 dp) and pushed as `?poly=lon,lat;…` (`page` reset). The
  active boundary renders as a dashed ink polygon with a faint orange
  wash, owns `fitBounds`, and shows ✕ CLEAR BOUNDARY (map) + the
  toolbar clear chip ("custom boundary" bit). `lib/mls/geo.ts` gained
  `pointInPolygon` / `simplifyPolygon` / `serializePolygon` /
  `parsePolygon` (3–40 pts, DFW-range validated — junk URLs parse to
  undefined) / `polygonBounds`; `SearchFilters.polygon` runs through all
  three providers (local: slim bbox prefilter → JS point-in-polygon
  refine, same two-phase shape as radius; trestle: bounds-box
  approximation; mock: exact PIP). Precedence: polygon > radius > city.
- **Uncapped map**: `MAP_PIN_CAP` 600 → 5,000 (slim pins page in 5
  parallel 1,000-row chunks under PostgREST's response cap). When a
  payload is still capped, the chip reads "SHOWING 5,000 IN VIEW OF
  30,979 — ZOOM OR FILTER FOR MORE" and every `moveend` refetches with
  the viewport `bbox` (400 ms debounce, DFW-clamped server-side) so the
  visible window is always complete — verified 30,979 → 9,986 (Frisco,
  z12) → 4,012 uncapped (z13).
- **Two-layer marker renderer** (perf): big payloads build ONE static
  canvas-dot layer per payload (dots don't depend on the viewport);
  viewport changes only resync a DOM price-bubble overlay capped at
  400, and only when the bubble set actually changed — extras stay
  visible as dots underneath. The old single layer rebuilt every
  event-wired marker on each moveend AND zoomend (2× per zoom step;
  up to 5,000 markers, unbounded DOM bubbles at z≥13 — 4,012 in
  Frisco). Measured after: zero >50 ms long tasks across zoom storms.
- **Field note**: a "renderer frozen" scare during verification was
  Chrome background-tab throttling (hidden tabs: rAF suspended, so
  Leaflet's *animated* zooms never commit; timers coalesce to 1/min
  after 5 min hidden — CDP evals with sleeps time out at 45 s). Test
  maps in a foreground tab or drive `setView(..., { animate: false })`.

### Phase 24 notes — instant shell, mobile map, big gallery, live copy

- **The 15–20s complaint**: production /homes blocked the whole page on
  `Promise.all(searchListings, getActiveCountsByCity)` — cold lambda +
  cold Supabase = the full-screen "PULLING THE LEDGER" for the entire
  wait. Two-part fix in `MapRoom.tsx`: (1) live mode returns the shell
  (nav, toolbar, map pane) with NO awaits — the rail resolves in an
  async subcomponent inside `<Suspense>` with a brand skeleton; the
  mobile index and compliance stamp stream in their own boundaries
  (the compliance fallback still renders the disclaimer + TREC links
  immediately — attribution may never lag the map's live pins).
  (2) both queries ride `unstable_cache` (rail keyed
  qs+page+pageSize, revalidate 120s; counts 300s) so even cold lambdas
  hit Vercel's shared Data Cache instead of Supabase. Mock mode keeps
  the original blocking tree. `/api/map-pins`' box head-count is now
  non-fatal — a count timeout degrades the chip total instead of
  500ing the map (it had bricked it to "PLOTTING THE MAP…").
- **Mobile map**: globals.css used to `display:none` the map under
  940px, full stop. New client `HomesSplit` (server slots as
  ReactNode) adds a floating ◐ MAP / ☰ LIST toggle (fixed, z1400) that
  flips `.homes-view-map`; map fills `calc(100dvh - 120px)`. Leaflet
  now survives initializing inside `display:none`: a ResizeObserver
  calls `invalidateSize()` on any size change, and fits requested
  while the pane had no box are deferred (`fitPendingRef`) and applied
  on first reveal — but a pane hidden AFTER a real fit keeps the
  user's camera across list↔map round trips (verified: Frisco z13
  survives a round trip exactly). Draw overlay/hint/hover-card z-order
  raised to 1500/1550/1600 so a draw stroke can't hit the toggle.
- **Pins follow the camera**: the bbox refetch used to run only while
  a payload was `capped` — after one uncapped viewport payload, pan/
  zoom went dead (zoom out = mostly empty map). `bboxFollowRef` arms on
  any bbox fetch and resets per qs; refetch listens on moveend+zoomend
  through the same 400ms debounce; degenerate bounds from a hidden
  0×0 pane are skipped. Verified both directions (5,000-cap → 4,012
  uncapped @Frisco z13 → capped again on zoom-out).
- **Gallery**: dossier shell 860→1240 with text sections re-capped at
  860; `ListingPhotoGallery` is a container-query collage (hero ~60%
  spanning 2 rows + 2×2 tiles, height clamp(380px,46vw,640px), hero
  measured 615×636 vs the old ≤440) with graceful 0–4-photo collapses,
  VIEW ALL {N} PHOTOS pill, +N chips per layout, LCP-eager hero,
  lightbox untouched.
- **Copy sweep**: every "placeholder / connect MLS" claim now gates on
  `isLiveMls` — hood pages get a "SEARCH LIVE {CITY} HOMES →" chip,
  the sitewide footer says "LISTINGS LIVE FROM NTREIS — REFRESHED
  EVERY 15 MINUTES", StatsBand/InteractiveMap/NewBuilds/dossier median
  relabel their editorial figures "EDITORIAL ESTIMATE" (they must not
  claim live either). `lib/compliance.ts` untouched (frozen pending
  broker review). Future work: compute a real metro median for
  StatsBand from snapshots.
- **Dev-verification footnote**: React streaming leaves the shell's
  pre-resolve tree in a `<div hidden>` in dev — DOM probes must filter
  on visibility or they read phantom "PLOTTING THE MAP…" chips.

### Phase 25 notes — mobile polish + accessibility

Audited all seven surfaces (map room, city homes, listing dossier, saved
homes, saved searches, auth gate, lead sheets) against a nine-point
checklist; ~60 findings fixed. The load-bearing ones:

- **Saved homes was broken in production** (found by the audit): the page
  still fed `mockListings`, so every live-feed save rendered "NO LONGER
  AVAILABLE". New `GET /api/shelf-listings?keys=` (numeric-validated,
  deduped, ≤60 keys, public `Listing` projection only, private/no-store)
  hydrates the dashboard client-side in live mode; a fetch failure shows
  "SHELF LOOKUP FAILED — TRY A REFRESH" instead of false off-market rows.
- **Contrast**: the muted-ink microcopy tokens failed WCAG across the
  board (ink@.45 = 2.8:1, @.5 = 3.3:1, @.55 = 3.8:1 on cream — including
  the legally required IDX attribution/disclaimer strips). All text at
  those alphas → `.62` (4.7:1); borderline `.6` → `.65`; the dark footer
  stamp cream@.45 → `.55`. Small orange (#D9481F = 3.8:1) → `#C13E17`
  (4.7:1 — the pre-existing `.btn-primary` hover shade) for text under
  ~19px; big serif prices/borders/fills stay #D9481F. Filled-orange
  buttons (cream text) rest at #C13E17 now, hover #B23814 — done once in
  globals via `.btn-primary[style*="d9481f" i]` with `!important` (inline
  styles otherwise win).
- **Dialogs**: new `lib/use-dialog-a11y.ts` (Escape close, Tab trap,
  focus into panel on open + restore to opener on close, body scroll
  lock; opener captured at render time so AuthModal's autoFocus
  survives) wired into RequestShowingSheet, AskQuestionSheet, AuthModal,
  SoftAccountGate, and the gallery lightbox. Sheets/auth also gained
  input aria-labels, role="alert" errors with aria-invalid/describedby,
  aria-pressed selection chips, and 16px inputs (kills iOS focus-zoom;
  toolbar inputs get 16px under 940px via `.ddfw-toolbar` CSS).
- **Mobile layout**: toolbar popovers were absolute-anchored and
  overflowed 375px viewports — under 940px they now pin as a fixed sheet
  (`[data-ddfw-pop] > [role="dialog"]`). The floating MAP/LIST toggle sat
  on the TREC links at full scroll — the compliance footer reserves 96px
  under 940px and the toggle respects `env(safe-area-inset-bottom)`, as
  does the dossier's sticky CTA bar.
- **Tap targets** to ≥40px: pager arrows, draw/clear boundary, map-card
  photo arrows + a new labeled close button on the pin card (touch had
  no discoverable dismissal), Leaflet zoom, toolbar pills/option chips,
  hearts (default 40), account text-buttons (SIGN OUT/REMOVE/RUN with
  hit-slop padding), cadence pills, sheet chips. REMOVE on saved
  searches is now a two-tap confirm ("SURE? REMOVE", 3s window).
- **States/CLS**: both account dashboards show broadsheet-silhouette
  skeletons until the shelf resolves (count pills show "—", no false
  empty); `/city/[slug]/homes` verified to have its loading.tsx; the
  mobile index streams behind a row skeleton instead of a blank page;
  rail skeleton photo slots 180→210 to match the real card (kills the
  stream-swap jump); SIGN IN/badge reserve space in the sticky nav;
  `scrollbar-gutter: stable` stops the lightbox scroll-lock shift.
- Verified in-browser at 375px and 1440px: index-first default, popover
  in-viewport + focused, Escape/focus-restore on sheets and auth modal,
  TREC links clear the toggle, attribution at rgba(.62), desktop layout
  pixel-identical (rail 520, toggle hidden, popovers anchored).

### Phase 26 notes — 90-city expansion, backfill incident + hardening

- **Expansion**: the `claude/dfw-map-labels-q2tacn` branch (authored in a
  separate session) grew `lib/dfw.data.json` from 53 to 90 full city
  entries — every previously label-only suburb (Carrollton, Waxahachie,
  Garland, Richardson, Lewisville, Mesquite, Grand Prairie, Mansfield…)
  now has a city page, hood pages, search tab, pins, and snapshot. The
  sync's Trestle scope derives from the same array, so the merge alone
  re-scoped replication; a full backfill pulled the inventory:
  metro actives 30,979 → **42,220**, 562 static pages (was 340).
- **Backfill incident (2026-07-07), for the record**: `?full=1` was a
  from-epoch walk with NO cross-invocation resume — once the 90-city
  walk outgrew one 240s budget, every call re-upserted the same oldest
  pages (compounded by a first fix whose timestamp regex rejected the
  feed's `-00:00` offset form, silently falling back to epoch). Hours of
  duplicated row+media churn saturated the NANO (0.5GB shared-CPU)
  Supabase instance until even `select … limit 1` timed out upstream;
  listing pages also hung because the live open-house fetch had no
  timeout. Recovery: compute upgraded NANO→SMALL (2GB dedicated,
  restart cleared the wedge), then the walk finished in 5 clean runs
  (~7.5k rows/150s on SMALL vs ~3k and sinking on NANO).
- **Hardening shipped**: `?cursor=ts|key` resume for full walks with a
  `cursorResumed` echo (callers MUST abort if false), `?pagesize=`
  (floor 25) so no single feed request can outrun the 300s gateway,
  every `odata()`/token call race-bounded at 8s/10s (degrade, never
  hang — Promise.race, not AbortSignal, which would opt fetches out of
  Next's data cache), and `/api/map-pins`' box count made non-fatal.
- **Runbook for the next city expansion**: merge dataset → deploy →
  `?full=1&budget=150000&pagesize=100` threading `cursor` from each
  response until `backfillComplete` (seed from the furthest cursor if
  resuming a broken walk) → verify per-city pins + a rail page + the
  snapshot chip. Watch per-run row counts: a declining trend means the
  DATABASE is drowning, not the feed.

### Market snapshots spec audit (post-Phase 20)

Audited against the "city market snapshots powered by listings database"
spec. Already built (Phases 18–20): the `city_market_snapshots`
generation step in the sync (active count, median list price, median
$/sqft, median DOM, as_of/updated stamp), featured/curated tier cards on
city reports, the homes-page mini-snapshot on live data. Closed by this
audit:

- **Status counts** — `CityMarketSnapshot.statusCounts` (Active /
  ActiveUnderContract / Pending), computed by the local provider from
  the store (ISR-cached; no migration needed) and shown as a
  "PENDING / UNDER K" card in the mini-snapshot. On-market statuses only.
- **City REPORT page numbers went live** — the hero pills and the
  "numbers at a glance" market cards on `/city/[slug]` now use the
  snapshot's median/psf/DOM (editorial figures remain the fallback and
  all editorial CONTENT — taglines, vibe, hoods — is untouched). YoY and
  the 12-month trend sparkline are labeled **(EST.)** — editorial
  estimates until a year of snapshot history exists to compute them.
- **Homepage/map metric hooks**: deliberately deferred — the homepage is
  fully static editorial; wiring live numbers there means ISR-ing the
  homepage for marginal value. Revisit with a concrete design.

**Sold-data position (explicit):** `close_price`/`CloseDate` exist in
the schema but **no sold-data statistics are computed or published
anywhere** — no sold charts, no closed-price medians. IDX Plus includes
sold records, but publishing sold-market stats has its own display
rules. ⚠ **Before launch marketing leans on ANY public market stats
(including the list-price medians now shown), verify permitted use with
the sponsoring broker / NTREIS** — same review track as the compliance
copy in `lib/compliance.ts`.

### Media handling plan + display audit (post-Phase 20)

**Recommendations (the plan half of the media spec):**
- **Serve MLS CDN URLs directly — do NOT cache/rehost images.** The
  Cotality media URLs are public, signed, already CDN-backed (verified
  fast), and photos_count-complete at our 50/listing replication cap.
  ⚠ Rehosting, caching, or transforming MLS photos may exceed what the
  IDX/Trestle data agreement allows — BROKER/MLS/COTALITY REVIEW
  REQUIRED before any image proxy or cache is built. None is built.
- **No image proxy/CDN layer for now**: next/image optimization quota
  can't cover a ~31k-listing inventory and a proxy inherits the
  agreement question above. Revisit only with (a) written approval and
  (b) a concrete perf need the direct CDN doesn't meet.
- **Placeholder**: the striped cream slot with the mono caption is the
  brand fallback — it now renders UNDER every image, so a missing URL
  or a mid-flight CDN failure degrades to it automatically.
- **Ordering**: feed `Order` is authoritative — replicated into
  `listing_media."order"`, sorted everywhere, primary = lowest order.
- **Gallery behavior**: collage (hero + two) → full-screen lightbox over
  all replicated photos; arrows, ←/→/Esc, counter, scroll lock,
  per-photo attribution line.
- **Performance**: dossier hero is the LCP — `loading=eager` +
  `fetchpriority=high`; everything else lazy + `decoding=async`. True
  `srcset` responsiveness is impossible without an image proxy (single
  rendition per CDN URL) — noted for the post-approval revisit.
- **Expired removal**: media cascade-deletes with listings; sync
  replaces media wholesale per touched listing; weekly reconcile
  off-markets zombie rows. No orphan process needed.

**Display audit closures** (rest existed in Phases 18–20):
- `onError` fallbacks everywhere — a broken CDN URL hides itself and
  the branded placeholder shows through (cards, collage) or a "PHOTO
  UNAVAILABLE" tile renders (lightbox). Broken media can no longer
  paint browser broken-image icons.
- Lightbox footer now carries the listing-broker attribution + MLS
  source alongside the counter.
- LCP eager-load on the dossier hero; `decoding=async` on all media.

### Phase 20 notes — live market band, lightbox, keyword search

- **Market band is honest now**: sync snapshots compute median
  days-on-market from the replicated `raw.CumulativeDaysOnMarket`; the
  local provider surfaces it, so median/psf/DOM on city pages are all
  live-computed. The chip flips from "PLACEHOLDER FIGURES" to
  "LIVE NTREIS MARKET DATA · YOY IS AN EDITORIAL ESTIMATE" — YoY keeps
  the editorial figure (labeled EST.) until a year of snapshot history
  exists to compute it from.
- **Photo lightbox**: `ListingPhotoGallery` is a client component — every
  collage slot and both count chips open a full-screen viewer (arrows,
  ←/→/Escape keys, counter, body-scroll lock). Sync media cap raised
  12→50 per listing; full repair walk re-replicated media (~1M rows).
- **Keyword search (`q` param)**: the toolbar search box submits non-city
  text on Enter — remarks/address/subdivision, ilike on the local store,
  `contains()` on trestle, includes() on mock. Serialized in the shared
  url module so saved searches / digests replay it like any filter.
  PostgREST or()-metacharacters are stripped from user input.
- Radius search deferred (needs PostGIS or an earthdistance index —
  planned against the local store).

## Content Intelligence Loop (parallel workstream)

Two human-in-the-loop workflows sharing one review pipeline: the **New
Build Analyzer** (detects/refreshes community data from the replicated
listings store) and the **Photo Slot Resolver** (fills the editorial
"DROP PHOTO" slots from license-safe sources). Full plan approved
2026-07-07; hard rules: nothing auto-publishes, no Google Images
scraping, MLS photos never appear on editorial surfaces, every publish
requires human approval + verification_events audit, all Trestle/MLS
access stays server-side.

| CI Phase | Scope | State |
| --- | --- | --- |
| CI-1 | Schema (`0009_content_intelligence.sql`), docs, `.env.example`, dry-run seed stub | ✅ merged 3d5352e; **0009 applied 2026-07-11** — 12 tables, RLS enabled on all, zero policies, `touch_updated_at()` + listings trigger verified intact |
| CI-2 | Seeder write path (`--diff` read-only, `--apply` env-gated), npm script, runbook | ✅ complete — seeded 2026-07-11, 635 photo_slots rows; idempotency re-run items_written=0 |
| CI-3 | `EditorialPhoto` render + placeholder fallback | ⏳ implementation in PR — merge is a separate approval gate |
| CI-4…11 | analyzer, providers, scoring, Claude drafts, admin queue, publish, jobs, compliance review | ⬜ |

### CI-3 notes — EditorialPhoto render (read-only feature)

- `lib/content/editorial-photos.ts` (server-only via `import "server-only"`,
  reuses `getSupabaseAdmin()`): one query per page — `photo_slots` where
  `status='approved'` inner-joined to `photo_assets`; keyed
  `entity_slug::slot_key` (homepage picks all share `slot_key='pick'`).
  AbortController timeout 3s; every failure path returns an empty map →
  placeholders render, a page can never 500 on a photo read. No RLS policy
  added; the browser only receives finished HTML.
- `components/EditorialPhoto.tsx`: no approved asset → renders the
  surface's existing placeholder markup (children) untouched; approved
  asset → plain `<img>` + mandatory attribution chip (links
  `source_page_url` when present). `priority` prop: hood heroes eager/high
  fetch priority, gallery + picks lazy.
- Dev-only mock (`CONTENT_EDITORIAL_PHOTO_MOCK=1`, non-production builds
  only, data:-URI image) exercises the approved path without any DB rows.
- Caching: city pages ISR 15m; hood pages + homepage are fully static —
  approved photos there appear on next deploy until CI-6's publish step
  calls `revalidatePath()` for affected pages (decided in CI-3 planning).
- Rollback: `git revert` of the merge — no DB changes exist in CI-3.

### CI-2 notes — photo_slots seeder (execution gated)

- **Slot key conventions:** `city/<slug>/gallery-{0,1,2}` (index = rendered
  gallery position), `neighborhood/<city>/<hood>/hero` (hood set = the
  hoods-array ∪ newBuilds union per `hoodsForCity()`; new-build
  communities share these slots — no `new_build` rows in CI-2),
  `homepage/<slug>/pick`. Expected totals: **635** = 270 city (63
  explicit + 207 fallback) + 361 hood heroes + 4 picks; explicit 428 /
  fallback 207. DB uniqueness via 0009's
  `unique (entity_type, entity_slug, slot_key)`.
- **Privilege tiers (`scripts/content/seed-photo-slots.mjs`):** default =
  offline dry-run (no DB client loaded — cannot write by construction);
  `--diff` = read-only compare (would-insert/update/protected/orphaned;
  claims no job-run row); `--apply` = writes, requiring BOTH the flag AND
  `CONTENT_INTELLIGENCE_DRY_RUN=false` **exactly** — unset or any other
  value refuses. `--limit=N` / `--only=<city-slug>` scope both tiers
  (orphan reporting is suppressed on scoped runs to avoid misreports).
- **Idempotency:** `--apply` claims the `content_job_runs` single-flight
  lock first (crashed-run release SQL prints on refusal). Existing slots
  update ONLY while `status = 'missing'` and only on dataset-derived
  fields (label, label_source, search_query, required_place_name,
  lat/lon, orientation); any slot the pipeline or a human has touched is
  never modified. Nothing is ever deleted — orphans are counted and
  listed, decision stays human. Re-running apply must yield
  inserted=0/updated=0.
- **Verification SQL (run after apply):**
  `select 'total', count(*)::text from photo_slots union all select
  'by_type:'||entity_type, count(*)::text from photo_slots group by
  entity_type union all select 'by_label_source:'||label_source,
  count(*)::text from photo_slots group by label_source union all select
  'all_missing', (count(*) = count(*) filter (where
  status='missing'))::text from photo_slots union all select 'ventana',
  count(*)::text from photo_slots where entity_slug =
  'fort-worth/ventana' union all select 'policies_zero',
  count(*)::text from pg_policies where tablename='photo_slots';`
  Expect 635 / 270-361-4 / 428-207 / true / 1 / 0, then a second apply
  proving items_written=0.
- **Rollback for seeded rows:** ⚠️ `truncate table public.photo_slots
  cascade;` is valid **only immediately after the initial seed and only
  with explicit approval — never run casually** (once candidates/assets
  exist it would cascade through human work). The safe later form:
  `delete from photo_slots s where s.status = 'missing' and not exists
  (select 1 from photo_candidates c where c.photo_slot_id = s.id);`
  Surgical variants: by `entity_type`, or by seeding window using the
  run row's started/finished timestamps. Job-run/error rows are always
  kept (audit).

### CI-1 notes — schema + groundwork (applied 2026-07-11)

- **Slot inventory (verified against main 012d440, corrected
  2026-07-10):** only **21 of 90 cities carry explicit `gallery` arrays**
  (63 curated labels); the other 69 render three generic fallback labels
  each via the `c.gallery || […]` default in `app/city/[slug]/page.tsx` —
  270 city slots total, of which 207 are fallback. Plus 361 hood heroes
  and 4 EditorsPicks = **635 slots**. `photo_slots.label_source`
  (`explicit|fallback`) records the difference so the resolver
  prioritizes curated landmarks over generic queries. Hood pages are the
  **union** of each city's `hoods` array and its `newBuilds` entries
  (`lib/hoods.ts` `hoodsForCity()` — every consumer resolves through
  it), so all 19 communities have live hood pages sharing those hero
  slots. An earlier CI-1 draft wrongly flagged "Ventana" (fort-worth) as
  a 404 by auditing the raw `hoods` array alone — **any future hood/link
  audit must resolve through `hoodsForCity()`**, never the raw JSON.
- **Feed reality (probed 2026-07-07, shapes the analyzer):**
  `NewConstructionYN` is null on every record (withheld, like
  OriginalListPrice) — new-build detection uses `year_built >= year-1`
  (9,724 actives feed-wide) — and `BuilderName/BuilderModel/
  AssociationName` exist but are 0% populated, so builder identity
  derives from `ListOfficeName`/remarks and requires human verification
  (`community_builders.derivation`). `SubdivisionName` is 100% populated
  but messy: phase suffixes ("Pecan Square Ph 1c") and homonyms (an
  unrelated "Pecan Square Condos" in Addison) — hence
  `community_aliases` + geo-clustering, never bare name matches.
- **Concurrency/lock strategy (REQUIRED before any scheduled analyzer
  job):** `content_job_runs` carries a partial unique index on
  `(job_name) where finished_at is null` — a job claims its run row
  first; a second concurrent instance fails that insert immediately.
  DB-level, pool-safe (session advisory locks don't survive PostgREST
  pooling). Crashed-run release: `update content_job_runs set
  finished_at = now(), status = 'failed' where job_name = '…' and
  finished_at is null;`. No job may be scheduled until it uses this
  claim/release discipline — lesson from the 2026-07-07 sync incident.
- **Media-table audit (REQUIRED before CI-4/5 rely on photo/media
  counts):** the 2026-07-07 backfill incident re-upserted rows dozens of
  times; before trusting `listing_media` counts, run (read-only):
  `select listing_key, media_url, count(*) from listing_media group by
  1,2 having count(*) > 1 limit 50;` (duplicate rows) and
  `select count(*) from listings l join lateral (select count(*) n from
  listing_media m where m.listing_key = l.listing_key) mc on true where
  l.photos_count is not null and mc.n > l.photos_count;` (over-count vs
  feed). If either returns rows, dedupe/repair BEFORE the analyzer or
  resolver consumes media counts.
- **Guardrails encoded in the schema:** `photo_candidates.source` has no
  `mls` value (structural exclusion); `google_places` exists in the enum
  but the provider ships **disabled in v1** (`CONTENT_ENABLE_GOOGLE_PLACES`
  defaults false); one `photo_assets` row per slot (unique); the
  pending-candidate partial unique index makes analyzers idempotent;
  every table is RLS-enabled-no-policies (server-only door).
- **Rollback:** CI-1 tables carry no production data until later phases —
  rollback is the ordered `drop table` block at the bottom of
  `0009_content_intelligence.sql` (do not drop `touch_updated_at()`,
  shared with 0006).
- **Dry-run stub:** `node scripts/content/seed-photo-slots.mjs` — no DB
  client, no network; prints the 634-slot inventory; `--apply` exits 1
  until CI-2 is approved.

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
