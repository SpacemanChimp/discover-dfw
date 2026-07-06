-- Phase 12 (user-spec "Phase 10"): lead capture — showing requests,
-- listing questions, and the lead_events analytics trail.
--
-- All three tables are written ONLY by the server (secret-key client) so
-- guests can submit without a session. RLS is enabled with no policies:
-- anon/authenticated roles can neither read nor write; the service role
-- bypasses RLS. Same posture as the existing `leads` table.

create extension if not exists pgcrypto;

-- ---- lead_events: one row per lead-generating action -------------------
create table if not exists public.lead_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  session_id  text,
  event_type  text not null,
  listing_key text,
  city_slug   text,
  source_page text not null default '',
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists lead_events_created_idx on public.lead_events (created_at desc);
create index if not exists lead_events_type_idx on public.lead_events (event_type, created_at desc);

alter table public.lead_events enable row level security;

-- ---- showing_requests: a request, not a confirmed booking --------------
create table if not exists public.showing_requests (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users (id) on delete set null,
  listing_key           text not null,
  requested_day         date not null,
  requested_time_window text not null,
  showing_mode          text not null check (showing_mode in ('in_person', 'live_video')),
  name                  text not null,
  email                 text not null,
  phone                 text,
  message               text,
  status                text not null default 'new',
  created_at            timestamptz not null default now()
);

create index if not exists showing_requests_status_idx on public.showing_requests (status, created_at desc);
create index if not exists showing_requests_listing_idx on public.showing_requests (listing_key);

alter table public.showing_requests enable row level security;

-- ---- listing_questions: routed to one guide, never a lead list ---------
create table if not exists public.listing_questions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  listing_key text not null,
  question    text not null,
  name        text not null,
  email       text not null,
  phone       text,
  status      text not null default 'new',
  created_at  timestamptz not null default now()
);

create index if not exists listing_questions_status_idx on public.listing_questions (status, created_at desc);
create index if not exists listing_questions_listing_idx on public.listing_questions (listing_key);

alter table public.listing_questions enable row level security;
