-- Remediation: six additional first-party analytics event names for the
-- signup/newsletter/city-guide funnels (site launch audit, 2026-08).
-- Purely additive: the site_events event CHECK gains the new names; every
-- existing row, column, and index is untouched. Until this is applied the
-- API refuses the new names server-side and the client beacons are
-- dropped quietly — no visitor workflow can notice either way.
--
-- The new names (contract in lib/analytics/events.ts, same PII rules —
-- no emails/names/phones/free text ever, context is categories only):
--   city_guide_view     a city guide page was viewed (city_slug context)
--   save_home_click     the heart on a listing card/page was used
--   signup_modal_open   the account gate/modal opened (intent = trigger:
--                       save-search | save-home | header-signin | account-cta)
--   signup_complete     an account came into being (no identity payload)
--   newsletter_view     an inline newsletter signup form became visible
--   newsletter_error    a newsletter submit failed (no address recorded)
--
-- ⚠ NOT applied automatically. Apply via the dashboard SQL editor with
-- the byte-exact procedure (same as 0009–0023), after the deploy review.

alter table public.site_events
  drop constraint if exists site_events_event_check;
alter table public.site_events
  add constraint site_events_event_check
  check (event in (
    'search_started','search_results_viewed','search_view_changed',
    'listing_viewed','phone_clicked','cta_clicked',
    'lead_form_started','lead_submitted','showing_requested',
    'saved_search_created','letter_signup_started','letter_subscribed',
    'city_guide_view','save_home_click','signup_modal_open',
    'signup_complete','newsletter_view','newsletter_error'));

-- ---------------------------------------------------------------------------
-- Rollback (manual, comment-only — never executed automatically):
--   alter table public.site_events drop constraint site_events_event_check;
--   alter table public.site_events add constraint site_events_event_check
--     check (event in (
--       'search_started','search_results_viewed','search_view_changed',
--       'listing_viewed','phone_clicked','cta_clicked',
--       'lead_form_started','lead_submitted','showing_requested',
--       'saved_search_created','letter_signup_started','letter_subscribed'));
-- ---------------------------------------------------------------------------
