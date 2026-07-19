-- 0019_visual_builder.sql — Visual Builder Phase 2
-- Extends the 0018 EDITOR infrastructure (NOT a replacement): page LAYOUTS
-- and the NAVIGATION document ride the existing editor_documents /
-- editor_versions model — same atomic RPCs, same optimistic concurrency,
-- same audit trail, same fail-open fallback to the code-owned templates.
--
-- New here:
--   1. editor_versions.content_type gains 'layout' (ordered block document)
--      and 'nav' (site navigation document).
--   2. editor_pages — the registry of ADMIN-CREATED static pages (slug,
--      template, SEO/social settings, navigation flags, publish status).
--      Draft pages are invisible to anonymous visitors (404 + noindex) and
--      excluded from the sitemap until published.
--   3. editor_publish_page / editor_unpublish_page — atomic wrappers that
--      publish a custom page's layout AND flip its status in ONE
--      transaction (row locks on both the page row and its document).
--
-- ⚠ NOT applied automatically. Apply via the dashboard SQL editor with
-- explicit approval, after the Phase-2 merge (same procedure as 0009–0018).
-- Until applied: layout/nav drafts fail their content_type check with a
-- clear error, /admin/editor's builder shows a migration-not-applied state
-- for page creation, and every public page renders exactly as today.

-- ---------------------------------------------------------------------------
-- 1. content_type extension (0018 defined richtext/text/faq)
-- ---------------------------------------------------------------------------
alter table public.editor_versions
  drop constraint if exists editor_versions_content_type_check;
alter table public.editor_versions
  add constraint editor_versions_content_type_check
  check (content_type in ('richtext','text','faq','layout','nav'));

-- ---------------------------------------------------------------------------
-- 2. editor_pages: admin-created static pages
-- ---------------------------------------------------------------------------
create table if not exists public.editor_pages (
  id               uuid primary key default gen_random_uuid(),
  -- top-level public slug ('sellers-guide' → /sellers-guide). Uniqueness
  -- against CODE routes is validated server-side against the route registry;
  -- this constraint guards page-vs-page collisions.
  slug             text not null unique
                     check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  title            text not null,
  template         text not null default 'blank'
                     check (template in ('blank','landing','buyer-guide','seller-guide','about-team','contact','listings-landing')),
  status           text not null default 'draft'
                     check (status in ('draft','published')),
  seo_title        text,
  seo_description  text,
  og_image_url     text,
  nav_label        text,
  show_in_nav      boolean not null default false,
  header_footer    boolean not null default true,
  created_by       text not null,          -- admin email
  published_by     text,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.editor_pages enable row level security;
-- No policies on purpose: service-role only, always AFTER the ADMIN_EMAILS
-- gate in the route handler (same posture as every other content table).

drop trigger if exists editor_pages_touch_updated on public.editor_pages;
create trigger editor_pages_touch_updated
  before update on public.editor_pages
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. PUBLISH PAGE: layout publish + status flip, one transaction.
--    Reuses editor_publish's exact semantics on the '/'||slug '__layout'
--    document, then marks the page published — a custom page can never be
--    'published' while its layout publish failed, or vice versa.
-- ---------------------------------------------------------------------------
create or replace function public.editor_publish_page(
  p_slug        text,
  p_version_no  integer,
  p_admin_email text
) returns integer
language plpgsql
as $$
declare
  pg public.editor_pages%rowtype;
  v_published integer;
begin
  if coalesce(trim(p_admin_email), '') = '' then
    raise exception 'admin email is required';
  end if;

  select * into pg from public.editor_pages where slug = p_slug for update;
  if not found then
    raise exception 'page % not found', p_slug;
  end if;

  -- same-transaction layout publish (locks the document row, supersedes the
  -- prior published version, writes the region audit event)
  select public.editor_publish('/' || p_slug, '__layout', p_version_no, p_admin_email)
    into v_published;

  update public.editor_pages
     set status = 'published',
         published_by = trim(p_admin_email),
         published_at = coalesce(pg.published_at, now())
   where slug = p_slug;

  insert into public.verification_events
    (entity_type, entity_slug, verified_by, verification_method, action, notes)
  values
    ('editor_page', p_slug, trim(p_admin_email), 'admin_review', 'publish',
     'page published (layout v' || v_published || ') — indexable + sitemap');

  return v_published;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. UNPUBLISH PAGE: back to draft (404 + noindex for anonymous visitors,
--    out of the sitemap). Layout history is preserved untouched.
-- ---------------------------------------------------------------------------
create or replace function public.editor_unpublish_page(
  p_slug        text,
  p_admin_email text
) returns void
language plpgsql
as $$
declare
  pg public.editor_pages%rowtype;
begin
  if coalesce(trim(p_admin_email), '') = '' then
    raise exception 'admin email is required';
  end if;

  select * into pg from public.editor_pages where slug = p_slug for update;
  if not found then
    raise exception 'page % not found', p_slug;
  end if;
  if pg.status <> 'published' then
    raise exception 'page % is not published', p_slug;
  end if;

  update public.editor_pages set status = 'draft' where slug = p_slug;

  insert into public.verification_events
    (entity_type, entity_slug, verified_by, verification_method, action, notes)
  values
    ('editor_page', p_slug, trim(p_admin_email), 'admin_review', 'unpublish',
     'page unpublished — draft-only (404/noindex for anonymous visitors)');
end;
$$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (documentation only — never run casually; verification_events
-- rows are audit history and are never rewritten or deleted):
--
--   drop function if exists public.editor_unpublish_page(text, text);
--   drop function if exists public.editor_publish_page(text, integer, text);
--   drop table if exists public.editor_pages;
--   alter table public.editor_versions drop constraint if exists editor_versions_content_type_check;
--   alter table public.editor_versions add constraint editor_versions_content_type_check
--     check (content_type in ('richtext','text','faq'));
--   -- (any 'layout'/'nav' versions must be deleted before re-adding the
--   --  narrow constraint — which is why this rollback is documentation.)
-- ---------------------------------------------------------------------------
