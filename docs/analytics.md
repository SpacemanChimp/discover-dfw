# Analytics — first-party events

Discover DFW measures itself with its own first-party pipeline. There is no
third-party tracker, no cookie banner dependency, and no external analytics
ID anywhere in the codebase.

## Architecture

- **Contract** — `lib/analytics/events.ts`: a closed 18-name event
  allowlist, shape-checked context fields, and structural privacy rules.
  Every submission is sanitized server-side; unknown fields are dropped.
- **Client** — `lib/analytics/track.ts` (`track(event, ctx, onceKey?)`):
  sendBeacon with keepalive-fetch fallback, UTM capture, strict-mode/
  navigation dedupe via `onceKey`, never throws, never blocks navigation.
  `components/analytics/TrackEvent.tsx` is the mount beacon for server
  components; `components/analytics/useLetterFormView.ts` is the
  scroll-into-view tracker for newsletter forms.
- **Intake** — `POST /api/events`: drops admin and Draft-Mode traffic,
  enforces the allowlist, and answers database failures with a quiet
  success so analytics can never break a visitor workflow.
- **Store** — the `site_events` table (migrations `0021`, `0024`), RLS
  enabled with no policies; only the server writes.

## Where the numbers appear

- **`/admin/growth`** (the Growth Command Center) is the reporting
  surface: sessions, funnel stages, attribution, per-page rollups, and the
  Search Console section. 7/28/90-day windows with prior-period deltas.
- Raw rows live in `site_events` and can be queried in the Supabase SQL
  editor; funnels join `lead_events` through the shared session id.
- "Page views" are event-based, not a generic pixel: surface views are
  explicit events (`search_results_viewed`, `listing_viewed`,
  `city_guide_view`, `newsletter_view`) so every row carries typed context
  instead of a raw URL.

## Event catalog

| Event | Fires when | Key context |
|---|---|---|
| `search_started` | first filter interaction on a search surface | scope, filter categories |
| `search_results_viewed` | a search results surface renders | scope, citySlug |
| `search_view_changed` | map/list flip | view |
| `listing_viewed` | a listing page renders | listingKey, citySlug |
| `city_guide_view` | a city guide renders | citySlug |
| `phone_clicked` | a tel: link is used (none public yet) | — |
| `cta_clicked` | a conversion CTA is opened (incl. builder-help intents) | intent, citySlug, communitySlug |
| `lead_form_started` / `lead_submitted` | conversion sheet opens / submits | intent; lead_id after submit |
| `showing_requested` | a showing request succeeds | listingKey, lead_id |
| `save_home_click` | the heart saves a home | listingKey |
| `saved_search_created` | a saved search persists (signed-in) | citySlug |
| `signup_modal_open` | the account gate/auth modal opens | intent: save-search, save-home, header-signin, account-cta |
| `signup_complete` | a brand-new account finishes sign-in | — |
| `letter_signup_started` | a newsletter form submits | — |
| `newsletter_view` | a newsletter form scrolls into view | — |
| `newsletter_error` | a newsletter submit fails | — |
| `letter_subscribed` | double-opt-in confirm lands (server-side) | — |

The audit's requested names map as: `home_search_view` →
`search_results_viewed`, `save_search_click` → `signup_modal_open`
(guests) + `saved_search_created` (members), `newsletter_signup` →
`letter_signup_started`/`letter_subscribed`, `contact_click` and
`builder_help_click` → `cta_clicked` with their intent values.

## Privacy rules (enforced in code, not by policy)

- The sanitizer refuses email-shaped and phone-shaped values anywhere in
  an event, stores paths query-stripped, and ignores unknown keys — so
  names, emails, phones, free-form search text, exact addresses, and
  tokens cannot reach the store even by mistake.
- Location context is categorical only: city slug, community slug, page
  type. School searches never transmit the searched school name.
- Admin-session and preview traffic is dropped server-side.
- Double-fire protection: `track()`'s `onceKey` dedupes per page life;
  the intake's unique `event_id` makes retries idempotent.

## Testing events

1. `npm run dev`, open a page, act (e.g. click a heart).
2. DevTools → Network → filter `/api/events` — one POST per action;
   `{"ok":true}` means stored, `{"ok":true,"dropped":true}` means the
   server declined it quietly (admin cookie, or migration not applied).
3. Confirm rows: `select event, path, created_at from site_events order by
   created_at desc limit 20;` in the Supabase SQL editor.
4. Signed-in admins are excluded — verify visitor flows in a private
   window.

## Configuration

- No environment variables are required for tracking itself (it rides the
  existing Supabase server credentials).
- **Migration `0024_analytics_events.sql` must be applied** (dashboard SQL
  editor, byte-exact procedure) before the six new event names store rows;
  until then they are refused quietly and nothing breaks.
- Optional: `NEXT_PUBLIC_SITE_URL` keeps referrer self-detection exact in
  non-production environments.
