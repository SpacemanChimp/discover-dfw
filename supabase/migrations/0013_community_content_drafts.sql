-- 0013_community_content_drafts.sql — SEO Community Editor CB-3a
-- Per-page editorial/SEO content drafts for ANY existing hood or new-build
-- page (keyed city_slug/hood_slug). Drafts are a WORKSPACE: nothing public
-- reads this table. Content reaches a page only through the separately-
-- gated CB-2 exporter's --content mode, which writes lib/hood-content.json
-- on a reviewed branch/PR — the JSON stays the single source of truth and
-- contentFor()'s generated copy remains the fallback for every page
-- without a custom key.
--
-- ⚠ NOT applied automatically. Apply via the dashboard SQL editor with
-- explicit approval, after the CB-3a merge (same procedure as 0009–0012).
-- Until applied: the CONTENT desk renders with an empty list and content
-- CRUD fails with "relation does not exist" — nothing else breaks.

create table if not exists public.community_content_drafts (
  id                uuid primary key default gen_random_uuid(),
  -- the page this content belongs to; must resolve to an EXISTING page
  -- (hoodsForCity union) at save AND at export time
  city_slug         text not null,
  hood_slug         text not null,
  -- SEO head — OPTIONAL and fallback-safe: generateMetadata uses these
  -- when present, its existing formula otherwise
  seo_title         text,
  seo_description   text,
  -- body blocks: exactly the HoodContent shape the page already renders.
  -- Export requires the full core set (tagline/intro/homes/highlights/faq)
  -- because contentFor() returns a hit as-is — a partial hit would render
  -- holes. Partial rows may exist as 'draft'; lint blocks the ready toggle.
  tagline           text,
  intro_json        jsonb,          -- string[] paragraphs
  homes_copy        text,
  highlights_json   jsonb,          -- {title, note}[]
  faq_json          jsonb,          -- {q, a}[]
  newbuild_json     jsonb,          -- {amenities: string[], buyerNotes: string[]} — nb pages only
  links_json        jsonb,          -- {label, href}[] — stored in CB-3a, rendered in CB-3b
  -- factual MLS hints frozen at edit time (display-only evidence; the
  -- claims linter screens whatever the admin actually writes)
  mls_snapshot_json jsonb,
  -- last lint result the portal computed ({errors:[],warnings:[],at})
  -- — advisory; the exporter re-lints from scratch and fails closed
  lint_json         jsonb,
  ready_for_export  boolean not null default false,
  lifecycle         text not null default 'draft'
                      check (lifecycle in ('draft','ready','exported','live','archived')),
  created_by        text not null,  -- admin email
  exported_at       timestamptz,
  live_at           timestamptz,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One live content draft per page; archived rows free the key for a redo.
create unique index if not exists community_content_drafts_key_unique
  on public.community_content_drafts (city_slug, hood_slug)
  where lifecycle <> 'archived';

create index if not exists community_content_drafts_lifecycle_idx
  on public.community_content_drafts (lifecycle, updated_at desc);

alter table public.community_content_drafts enable row level security;
-- No policies on purpose: service-role only, always AFTER the ADMIN_EMAILS
-- gate in the route handler (same posture as every other content table).

drop trigger if exists community_content_drafts_touch_updated on public.community_content_drafts;
create trigger community_content_drafts_touch_updated
  before update on public.community_content_drafts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Rollback (manual, documented only — do not run casually):
--   drop table if exists public.community_content_drafts;
-- verification_events rows referencing community_content_draft entities are
-- audit history and are never rewritten or deleted.
-- ---------------------------------------------------------------------------
