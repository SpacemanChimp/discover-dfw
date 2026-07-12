-- 0012_community_drafts.sql — Community Builder CB-1
-- Admin-drafted community entries (regular hood or new-build). Drafts are a
-- WORKSPACE, not a publication path: nothing public reads this table. An
-- entry becomes public only through the separately-gated exporter (CB-2,
-- not yet implemented), which writes lib/dfw.data.json on a reviewed
-- branch/PR — the JSON stays the single source of truth for pages.
--
-- ⚠ NOT applied automatically. Apply via the dashboard SQL editor with
-- explicit approval, after the CB-1 merge (same procedure as 0009–0011).
-- Until applied: /admin/communities renders with an empty draft list and
-- draft CRUD fails with "relation does not exist" — nothing else breaks.

-- ---------------------------------------------------------------------------
-- 1. community_drafts — one row per drafted entry.
--    lifecycle: draft -> ready -> exported -> live, or archived at any
--    pre-live stage. exported/live stamps are written by the CB-2 exporter
--    and post-merge confirmation, never by the portal.
-- ---------------------------------------------------------------------------
create table if not exists public.community_drafts (
  id                  uuid primary key default gen_random_uuid(),
  type                text not null check (type in ('hood','new_build')),
  name                text not null,
  city_slug           text not null,
  -- page slug under /city/[city_slug]/ — generated via slugifyHood, admin-editable
  slug                text not null,
  -- editorial status string exactly as it renders (new_build only; hood rows null).
  -- Constrained to the values already present in dfw.data.json — anything new
  -- needs a schema decision first, not a free-text field.
  status_label        text check (status_label in ('NOW SELLING','MODELS OPEN','FINAL PHASE','SOLD OUT')),
  from_label          text,          -- editorial price band, e.g. '$230s'
  builders_count      integer check (builders_count is null or builders_count >= 0),
  builders_label      text,          -- generic fallback when a count is weak, e.g. 'SEVERAL BUILDERS'
  note                text,          -- short editorial line; no unverified claims
  ready_for_export    boolean not null default false,
  lifecycle           text not null default 'draft'
                        check (lifecycle in ('draft','ready','exported','live','archived')),
  -- optional link to the NB-1 intelligence row once one exists for this community
  linked_community_id uuid references public.new_build_communities (id) on delete set null,
  -- MLS lookup evidence frozen at draft time (counts, aliases, homonyms,
  -- suggested band). Bounded by the portal; never contains secrets or paths.
  mls_snapshot_json   jsonb,
  created_by          text not null, -- admin email
  exported_at         timestamptz,
  live_at             timestamptz,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One live draft per page slug; archived rows free the slug for a redo.
create unique index if not exists community_drafts_slug_unique
  on public.community_drafts (city_slug, slug)
  where lifecycle <> 'archived';

create index if not exists community_drafts_lifecycle_idx
  on public.community_drafts (lifecycle, updated_at desc);

alter table public.community_drafts enable row level security;
-- No policies on purpose: service-role only, always AFTER the ADMIN_EMAILS
-- gate in the route handler (same posture as the other content tables).

drop trigger if exists community_drafts_touch_updated on public.community_drafts;
create trigger community_drafts_touch_updated
  before update on public.community_drafts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. verification_events.action gains draft-CRUD verbs. The original check
--    was created inline in 0009 (auto-named). Extending a check constraint
--    adds allowed values only — existing rows and history are untouched.
-- ---------------------------------------------------------------------------
alter table public.verification_events
  drop constraint if exists verification_events_action_check;
alter table public.verification_events
  add constraint verification_events_action_check
  check (action in ('verify','approve','reject','needs_research','publish','unpublish','create','update','archive'));

-- ---------------------------------------------------------------------------
-- Rollback (manual, documented only — do not run casually):
--   drop table if exists public.community_drafts;
--   alter table public.verification_events drop constraint verification_events_action_check;
--   alter table public.verification_events add constraint verification_events_action_check
--     check (action in ('verify','approve','reject','needs_research','publish','unpublish'));
-- Existing verification_events rows written with the new verbs would violate
-- the restored constraint — delete is NOT the answer; leave the extended
-- constraint in place if any draft events exist (audit history is never
-- rewritten).
-- ---------------------------------------------------------------------------
