-- Content Intelligence Loop, Phase CI-1: schema only.
--
-- Two workflows share one review pipeline: the New Build Analyzer (reads
-- the replicated listings store, proposes community updates) and the
-- Photo Slot Resolver (seeds editorial photo slots from the dataset's
-- gallery labels, proposes licensed candidates from approved sources).
-- NOTHING in this migration is read or written by any running code yet —
-- analyzers, admin queue, and rendering arrive in later phases, each
-- behind its own approval. Publishing is always a human action; there is
-- no auto-publish path by design.
--
-- SECURITY: RLS enabled with NO policies on every table — service-role
-- (server) access only, same door pattern as the listings/lead tables.
-- Evidence payloads (MLS remarks snippets, raw photo-API responses) are
-- admin-eyes-only and MUST never be publicly readable.
--
-- COMPLIANCE: photo_candidates.source deliberately has no 'mls' value —
-- MLS listing media is structurally excluded from editorial surfaces.
-- Builder facts (counts, prices, school zoning, phase claims) publish
-- only after human verification recorded in verification_events.

create extension if not exists pgcrypto;

-- reused by every table with updated_at (first defined in 0006)
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---- new_build_communities: DB overlay over the static newBuilds array --
-- Pages read published rows first and fall back to lib/dfw.data.json, so
-- an empty table is exactly today's behavior.
create table if not exists public.new_build_communities (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text not null unique,
  name                    text not null,
  city_slug               text not null,
  -- set when the community has a hood page (/city/[slug]/[hood])
  hood_slug               text,
  county                  text,
  status                  text not null default 'unverified'
                            check (status in ('now_selling','models_open','final_phase','sold_out','unverified')),
  type                    text not null default 'master_planned',
  price_from_label        text,          -- editorial form: "$480s"
  price_from_numeric      numeric,       -- verified numeric floor
  builders_count          integer,
  school_district         text,
  latitude                double precision,
  longitude               double precision,
  hero_summary            text,
  editorial_vibe          text,
  amenities_json          jsonb,
  field_notes_json        jsonb,
  faq_json                jsonb,
  source_urls_json        jsonb,
  -- SubdivisionName variants observed in MLS that map to this community
  subdivision_names_json  jsonb,
  last_verified_at        timestamptz,
  verification_status     text not null default 'unverified'
                            check (verification_status in ('unverified','human_verified','stale')),
  confidence_score        numeric,
  published               boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists nbc_city_idx      on public.new_build_communities (city_slug, published);
create index if not exists nbc_published_idx on public.new_build_communities (published, status);

alter table public.new_build_communities enable row level security;

drop trigger if exists nbc_touch_updated on public.new_build_communities;
create trigger nbc_touch_updated
  before update on public.new_build_communities
  for each row execute function public.touch_updated_at();

-- ---- community_aliases: normalization layer for messy SubdivisionNames --
-- "Pecan Square Ph 1c" -> Pecan Square. The homonym trap is real: the
-- feed carries an unrelated "Pecan Square Condos" in Addison, so aliases
-- are per-community rows, never global name matches.
create table if not exists public.community_aliases (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.new_build_communities (id) on delete cascade,
  alias         text not null,
  source        text not null default 'mls_subdivision'
                  check (source in ('mls_subdivision','manual','claude_suggested')),
  created_at    timestamptz not null default now(),
  unique (community_id, alias)
);

create index if not exists community_aliases_alias_idx on public.community_aliases (alias);

alter table public.community_aliases enable row level security;

-- ---- community_builders: builder presence per community ------------------
-- NTREIS withholds BuilderName (null on every record — probed 2026-07-07),
-- so builder identity derives from ListOfficeName / PublicRemarks and is
-- only publishable after human verification.
create table if not exists public.community_builders (
  id                    uuid primary key default gen_random_uuid(),
  community_id          uuid not null references public.new_build_communities (id) on delete cascade,
  builder_name          text not null,
  derivation            text not null default 'list_office'
                          check (derivation in ('list_office','public_remarks','manual','builder_site')),
  source                text,
  source_url            text,
  active_listing_count  integer not null default 0,
  first_seen_in_mls_at  timestamptz,
  last_seen_in_mls_at   timestamptz,
  last_verified_at      timestamptz,
  created_at            timestamptz not null default now(),
  unique (community_id, builder_name)
);

alter table public.community_builders enable row level security;

-- ---- community_inventory_stats: append-only per-run stats time series ----
create table if not exists public.community_inventory_stats (
  id                     uuid primary key default gen_random_uuid(),
  community_id           uuid not null references public.new_build_communities (id) on delete cascade,
  active_listing_count   integer not null default 0,
  pending_listing_count  integer not null default 0,
  -- heuristic: active + year_built >= current year + (remarks match
  -- ready-now phrases OR completed-status keywords) — definition may be
  -- tuned; consumers must treat this as an estimate, never a claim
  quick_move_in_count    integer not null default 0,
  min_price              numeric,
  median_price           numeric,
  max_price              numeric,
  median_sqft            numeric,
  median_price_per_sqft  numeric,
  builder_names_seen_json jsonb,
  source                 text not null default 'local_listings',
  calculated_at          timestamptz not null default now()
);

create index if not exists cis_community_idx
  on public.community_inventory_stats (community_id, calculated_at desc);

alter table public.community_inventory_stats enable row level security;

-- ---- photo_slots: every editorial photo position on the site -------------
-- Seeded from the dataset (Phase CI-2): city gallery labels (63 curated
-- across 21 cities + 207 fallback-label slots across 69 cities = 270),
-- 360 hood-page heroes (the 19 new-build communities ARE hood pages and
-- share those slots), 4 homepage editor's picks. label_source marks
-- curated vs fallback so the resolver can prioritize real landmarks.
create table if not exists public.photo_slots (
  id                    uuid primary key default gen_random_uuid(),
  entity_type           text not null
                          check (entity_type in ('city','neighborhood','new_build','homepage','newsletter','listing_module')),
  entity_slug           text not null,
  slot_key              text not null,     -- gallery-0|gallery-1|gallery-2|hero|pick
  label                 text not null,
  label_source          text not null default 'explicit'
                          check (label_source in ('explicit','fallback')),
  search_query          text,
  preferred_orientation text not null default 'landscape'
                          check (preferred_orientation in ('landscape','portrait','square')),
  desired_mood          text,
  required_place_name   text,
  latitude              double precision,
  longitude             double precision,
  status                text not null default 'missing'
                          check (status in ('missing','candidates_found','approved','rejected','stale')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (entity_type, entity_slug, slot_key)
);

create index if not exists photo_slots_status_idx on public.photo_slots (status, entity_type);

alter table public.photo_slots enable row level security;

drop trigger if exists photo_slots_touch_updated on public.photo_slots;
create trigger photo_slots_touch_updated
  before update on public.photo_slots
  for each row execute function public.touch_updated_at();

-- ---- photo_candidates: sourced images awaiting review ---------------------
-- NOTE: no 'mls' source exists on purpose. google_places is in the enum
-- but the provider stays DISABLED in v1 (CONTENT_ENABLE_GOOGLE_PLACES);
-- rows can only exist once a human turns that flag on in a later phase.
-- Candidates missing license/attribution/source are stored as
-- needs_research and can never reach the approve path.
create table if not exists public.photo_candidates (
  id                uuid primary key default gen_random_uuid(),
  photo_slot_id     uuid not null references public.photo_slots (id) on delete cascade,
  source            text not null
                      check (source in ('own_library','wikimedia','openverse','pexels','unsplash','google_places','builder_media','tourism','manual_upload')),
  external_id       text,
  image_url         text not null,
  thumbnail_url     text,
  source_page_url   text,
  photographer      text,
  attribution_text  text,
  attribution_html  text,
  license           text,
  license_url       text,
  license_verified  boolean not null default false,
  width             integer,
  height            integer,
  confidence_score  numeric,
  claude_notes      text,
  status            text not null default 'pending'
                      check (status in ('pending','approved','rejected','needs_research')),
  rejected_reason   text,
  -- unmodified provider API response — server-side evidence, NEVER public
  raw_api_response  jsonb,
  created_at        timestamptz not null default now(),
  unique (photo_slot_id, source, image_url)
);

create index if not exists photo_candidates_slot_idx on public.photo_candidates (photo_slot_id, status);

alter table public.photo_candidates enable row level security;

-- ---- photo_assets: the ONE approved, rehosted image per slot --------------
-- Approval downloads the original server-side and rehosts to Supabase
-- Storage; public pages render storage_path/public_image_url with the
-- attribution ALWAYS alongside. History lives in candidates + events.
create table if not exists public.photo_assets (
  id                     uuid primary key default gen_random_uuid(),
  photo_slot_id          uuid not null references public.photo_slots (id) on delete cascade,
  selected_candidate_id  uuid references public.photo_candidates (id) on delete set null,
  public_image_url       text not null,
  storage_path           text,
  width                  integer,
  height                 integer,
  alt_text               text not null,
  caption                text,
  attribution_text       text not null,
  attribution_html       text,
  source_page_url        text,
  license                text not null,
  approved_by            text not null,
  approved_at            timestamptz not null default now(),
  last_verified_at       timestamptz,
  created_at             timestamptz not null default now(),
  unique (photo_slot_id)
);

alter table public.photo_assets enable row level security;

-- ---- content_update_candidates: the unified review queue ------------------
create table if not exists public.content_update_candidates (
  id                    uuid primary key default gen_random_uuid(),
  candidate_type        text not null
                          check (candidate_type in (
                            'new_build_update','new_community_detected','community_stale',
                            'builder_change','price_range_change','inventory_change',
                            'missing_photo','photo_candidate','stale_photo',
                            'neighborhood_detected','duplicate_candidate')),
  entity_type           text not null,
  entity_slug           text not null,
  proposed_change_json  jsonb,
  before_json           jsonb,
  after_json            jsonb,
  -- listing keys, counts, remarks snippets — admin-eyes-only
  evidence_json         jsonb,
  confidence_score      numeric,
  status                text not null default 'pending'
                          check (status in ('pending','approved','rejected','needs_research','published')),
  claude_summary        text,
  reviewer_notes        text,
  created_at            timestamptz not null default now(),
  reviewed_at           timestamptz,
  published_at          timestamptz
);

-- idempotency backbone: re-running an analyzer UPDATES the open candidate
-- for an entity instead of stacking duplicates
create unique index if not exists cuc_pending_unique
  on public.content_update_candidates (candidate_type, entity_type, entity_slug)
  where status = 'pending';

create index if not exists cuc_status_idx on public.content_update_candidates (status, candidate_type, created_at desc);

alter table public.content_update_candidates enable row level security;

-- ---- source_evidence: provenance rows attached to candidates --------------
create table if not exists public.source_evidence (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references public.content_update_candidates (id) on delete cascade,
  source_type    text not null
                   check (source_type in ('mls','builder_site','city_site','photo_api','manual','other')),
  source_url     text,
  source_name    text,
  evidence_json  jsonb,
  retrieved_at   timestamptz not null default now()
);

create index if not exists source_evidence_candidate_idx on public.source_evidence (candidate_id);

alter table public.source_evidence enable row level security;

-- ---- verification_events: the audit log for every human decision ----------
create table if not exists public.verification_events (
  id                   uuid primary key default gen_random_uuid(),
  entity_type          text not null,
  entity_slug          text not null,
  verified_by          text not null,       -- admin email
  verification_method  text not null default 'admin_review'
                         check (verification_method in ('admin_review','field_visit','builder_contact','phone','other')),
  action               text not null default 'verify'
                         check (action in ('verify','approve','reject','needs_research','publish','unpublish')),
  notes                text,
  created_at           timestamptz not null default now()
);

create index if not exists verification_events_entity_idx
  on public.verification_events (entity_type, entity_slug, created_at desc);

alter table public.verification_events enable row level security;

-- ---- content_job_runs: bookkeeping + CONCURRENCY LOCK ---------------------
-- The partial unique index is the lock: a job inserts its run row first,
-- and a second concurrent instance of the same job fails that insert
-- immediately (finished_at is null while running). This is a DB-level
-- guarantee, chosen over pg_advisory_lock because PostgREST connections
-- are pooled — session-scoped advisory locks don't survive the pool.
-- REQUIRED discipline for every analyzer/resolver job, scheduled or
-- manual: claim the run row, do the work, stamp finished_at in a finally
-- block. A crashed run is released by stamping finished_at manually
-- (documented in the runbook) — an acceptable failure mode learned from
-- the 2026-07-07 sync incident, where invisible concurrent walks
-- compounded the damage.
create table if not exists public.content_job_runs (
  id             uuid primary key default gen_random_uuid(),
  job_name       text not null,       -- seed_photo_slots | analyze_new_builds | resolve_photo_slots | score_candidates | review_draft | publish_approved | verify_assets
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running'
                   check (status in ('running','success','partial','failed')),
  dry_run        boolean not null default true,
  items_seen     integer not null default 0,
  items_written  integer not null default 0,
  error_summary  text
);

create unique index if not exists content_job_runs_single_flight
  on public.content_job_runs (job_name)
  where finished_at is null;

create index if not exists content_job_runs_started_idx on public.content_job_runs (job_name, started_at desc);

alter table public.content_job_runs enable row level security;

-- ---- content_job_errors: per-item failures within a run -------------------
create table if not exists public.content_job_errors (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.content_job_runs (id) on delete cascade,
  item_ref    text,                    -- slot key, community slug, candidate id…
  stage       text not null default '',
  message     text not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists content_job_errors_run_idx on public.content_job_errors (run_id, created_at);

alter table public.content_job_errors enable row level security;

-- ---------------------------------------------------------------------------
-- ROLLBACK (Phase CI-1 tables carry no production data until later phases,
-- so rollback is pure drops — dependency order matters):
--
--   drop table if exists public.content_job_errors;
--   drop table if exists public.content_job_runs;
--   drop table if exists public.verification_events;
--   drop table if exists public.source_evidence;
--   drop table if exists public.content_update_candidates;
--   drop table if exists public.photo_assets;
--   drop table if exists public.photo_candidates;
--   drop table if exists public.photo_slots;
--   drop table if exists public.community_inventory_stats;
--   drop table if exists public.community_builders;
--   drop table if exists public.community_aliases;
--   drop table if exists public.new_build_communities;
--
-- (touch_updated_at() is shared with 0006 — do NOT drop it.)
-- ---------------------------------------------------------------------------
