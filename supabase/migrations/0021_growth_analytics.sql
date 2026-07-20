-- First-party conversion analytics (Growth Command Center, phase 2).
-- One append-only table of ALLOWLISTED site events — the smallest additive
-- store that lets the /admin/growth dashboard answer "which pages and
-- actions generate leads" without any third-party tracker.
--
-- Privacy is structural, not aspirational: the API layer
-- (app/api/events + lib/analytics/events.ts) enforces a closed world of 12
-- event names and shape-validated context fields — no free-form metadata
-- column exists, paths are stored query-stripped, and PII-shaped values
-- (emails, phone-length digit runs) are refused before insert. The event
-- check constraint below is the database's own copy of the allowlist.
--
-- Idempotency: the client mints one uuid per logical emission
-- (event_id); the unique index makes retries (sendBeacon/keepalive,
-- double-mounted effects) insert-once. Admin and Draft-Mode preview
-- traffic is dropped at the API layer and never lands here.
--
-- RLS is ENABLED with NO policies (the 0009/0012/0018 pattern): only the
-- server-side service key can read or write; the browser talks to
-- /api/events, never to this table.

create table if not exists public.site_events (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null,
  event              text not null
                       check (event in (
                         'search_started','search_results_viewed','search_view_changed',
                         'listing_viewed','phone_clicked','cta_clicked',
                         'lead_form_started','lead_submitted','showing_requested',
                         'saved_search_created','letter_signup_started','letter_subscribed')),
  session_id         text not null check (char_length(session_id) between 16 and 36),
  path               text not null check (path like '/%' and char_length(path) <= 200),
  page_type          text not null
                       check (page_type in ('home','search','listing','city','community','letter','research','other')),
  city_slug          text check (city_slug ~ '^[a-z0-9-]{2,60}$'),
  community_slug     text check (community_slug ~ '^[a-z0-9-]{2,60}$'),
  listing_key        text check (listing_key ~ '^[A-Za-z0-9_-]{4,40}$'),
  intent             text check (char_length(intent) <= 40),
  scope              text check (scope in ('homes','land','new-builds','city-homes')),
  view               text check (char_length(view) <= 20),
  filter_categories  text check (char_length(filter_categories) <= 160),
  utm_source         text check (char_length(utm_source) <= 80),
  utm_medium         text check (char_length(utm_medium) <= 80),
  utm_campaign       text check (char_length(utm_campaign) <= 80),
  utm_content        text check (char_length(utm_content) <= 80),
  utm_term           text check (char_length(utm_term) <= 80),
  referrer_domain    text check (char_length(referrer_domain) <= 100),
  lead_id            uuid,
  created_at         timestamptz not null default now()
);

comment on table public.site_events is
  'First-party allowlisted conversion events (Growth Command Center). No PII by construction — the API layer refuses email/phone-shaped values and stores paths query-stripped.';

-- idempotent inserts: one row per client emission
create unique index if not exists site_events_event_id_key
  on public.site_events (event_id);

-- the dashboard's read shapes: per-event time ranges, per-page rollups,
-- per-session funnels
create index if not exists site_events_event_time_idx
  on public.site_events (event, created_at desc);
create index if not exists site_events_path_time_idx
  on public.site_events (path, created_at desc);
create index if not exists site_events_session_time_idx
  on public.site_events (session_id, created_at desc);
create index if not exists site_events_time_idx
  on public.site_events (created_at desc);

alter table public.site_events enable row level security;
-- NO policies on purpose: service-key access only (0009/0012/0018 pattern).

-- ---------------------------------------------------------------------------
-- Rollback (manual, comment-only — never executed automatically):
--   drop index if exists public.site_events_time_idx;
--   drop index if exists public.site_events_session_time_idx;
--   drop index if exists public.site_events_path_time_idx;
--   drop index if exists public.site_events_event_time_idx;
--   drop index if exists public.site_events_event_id_key;
--   drop table if exists public.site_events;
-- ---------------------------------------------------------------------------
