-- Phase 17: local MLS listings store + sync bookkeeping.
--
-- Groundwork for a replication-based provider: a future sync job upserts
-- the Trestle/NTREIS feed into these tables and the site reads locally.
-- The current trestle provider (live OData per request) keeps working —
-- nothing reads these tables yet.
--
-- SECURITY: RLS enabled with NO policies on every table — service-role
-- (server) access only. In particular, listings.raw holds the unmodified
-- feed payload for debugging and MUST never be publicly readable; the
-- browser never talks to these tables at all.

create extension if not exists pgcrypto;

-- ---- listings: one row per property, keyed by the RESO ListingKey ------
create table if not exists public.listings (
  listing_key              text primary key,
  listing_id               text not null default '',
  standard_status          text not null,
  list_price               numeric,
  close_price              numeric,
  beds                     integer,
  baths                    numeric,
  living_area              integer,
  lot_size                 numeric,          -- acres
  year_built               integer,
  property_type            text not null default '',
  property_sub_type        text,
  street_number            text,
  street_name              text,
  unparsed_address         text not null default '',
  city                     text not null default '',
  state                    text not null default 'TX',
  postal_code              text,
  county                   text,
  subdivision              text,
  latitude                 double precision,
  longitude                double precision,
  public_remarks           text,
  list_office_name         text,
  -- populated only if the IDX display rules permit agent-level display
  list_agent_name          text,
  originating_system_name  text,
  modification_timestamp   timestamptz not null,
  photos_count             integer,
  -- unmodified feed payload for server-side debugging — NEVER public
  raw                      jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists listings_status_idx      on public.listings (standard_status);
create index if not exists listings_city_idx        on public.listings (city, standard_status, list_price);
create index if not exists listings_modified_idx    on public.listings (modification_timestamp desc);
create index if not exists listings_type_idx        on public.listings (property_type, property_sub_type);
create index if not exists listings_postal_idx      on public.listings (postal_code);

alter table public.listings enable row level security;

-- keep updated_at honest on every upsert
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists listings_touch_updated on public.listings;
create trigger listings_touch_updated
  before update on public.listings
  for each row execute function public.touch_updated_at();

-- ---- listing_media: ordered photos per listing -------------------------
create table if not exists public.listing_media (
  id                      uuid primary key default gen_random_uuid(),
  listing_key             text not null references public.listings (listing_key) on delete cascade,
  media_key               text,
  media_url               text not null,
  "order"                 integer not null default 0,
  media_type              text not null default 'Photo',
  modification_timestamp  timestamptz,
  created_at              timestamptz not null default now()
);

create index if not exists listing_media_listing_idx on public.listing_media (listing_key, "order");

alter table public.listing_media enable row level security;

-- ---- mls_sync_runs: one row per sync invocation -------------------------
create table if not exists public.mls_sync_runs (
  id               uuid primary key default gen_random_uuid(),
  provider         text not null default 'trestle',
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  status           text not null default 'running'
                     check (status in ('running', 'success', 'partial', 'failed')),
  records_seen     integer not null default 0,
  records_upserted integer not null default 0,
  records_failed   integer not null default 0,
  error_summary    text
);

create index if not exists mls_sync_runs_started_idx on public.mls_sync_runs (started_at desc);

alter table public.mls_sync_runs enable row level security;

-- ---- mls_sync_errors: per-record failures within a run ------------------
create table if not exists public.mls_sync_errors (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.mls_sync_runs (id) on delete cascade,
  listing_key text,
  stage       text not null default '',    -- fetch | map | upsert | media
  message     text not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists mls_sync_errors_run_idx on public.mls_sync_errors (run_id, created_at);

alter table public.mls_sync_errors enable row level security;

-- ---- city_market_snapshots: daily computed market stats per city --------
create table if not exists public.city_market_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  city_slug             text not null,
  as_of                 date not null default current_date,
  active_listings       integer not null default 0,
  median_list_price     numeric,
  price_per_sqft        numeric,
  median_days_on_market integer,
  source                text not null default 'trestle',
  created_at            timestamptz not null default now(),
  unique (city_slug, as_of)
);

create index if not exists city_snapshots_city_idx on public.city_market_snapshots (city_slug, as_of desc);

alter table public.city_market_snapshots enable row level security;
