-- 0018_visual_editor.sql — EDITOR desk (override-based CMS)
-- Structured editorial overrides for a code-owned registry of editable
-- regions. The database stores ONLY drafts and published overrides; the
-- existing code/JSON content remains the fallback source for every region
-- with no published override, and MUST keep rendering if these tables are
-- missing or unreachable (the readers fail open to the code fallback).
--
-- Nothing public reads drafts: draft versions reach a browser only through
-- the admin-gated Next.js Draft Mode preview. Publishing is atomic (row
-- locks, one transaction per action) and every action writes an honest
-- verification_events audit row, exactly like the Photo Desk RPCs (0010).
--
-- ⚠ NOT applied automatically. Apply via the dashboard SQL editor with
-- explicit approval, after the editor merge (same procedure as 0009–0017).
-- Until applied: /admin/editor renders a migration-not-applied state,
-- editor writes return 503, and every public page renders its existing
-- code fallback — nothing else breaks.

-- ---------------------------------------------------------------------------
-- editor_documents: one row per (route, region) that has ever had a draft.
-- The published/draft pointers are the ONLY thing public readers consult;
-- clearing published_version_id restores the code fallback without touching
-- history.
-- ---------------------------------------------------------------------------
create table if not exists public.editor_documents (
  id                    uuid primary key default gen_random_uuid(),
  -- concrete public path ('/', '/land', '/city/frisco', '/city/aubrey/sandbrock-ranch')
  route                 text not null,
  -- region key from the code-owned registry ('intro', 'guide', 'faq', …)
  region_key            text not null,
  published_version_id  uuid,
  draft_version_id      uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists editor_documents_route_region_unique
  on public.editor_documents (route, region_key);

create index if not exists editor_documents_route_idx
  on public.editor_documents (route);

alter table public.editor_documents enable row level security;
-- No policies on purpose: service-role only, always AFTER the ADMIN_EMAILS
-- gate in the route handler (same posture as every other content table).

drop trigger if exists editor_documents_touch_updated on public.editor_documents;
create trigger editor_documents_touch_updated
  before update on public.editor_documents
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- editor_versions: append-only version history. content_json is the
-- structured editor document (never raw HTML); content_text is the
-- sanitized plain text for auditing/search. Versions are never deleted by
-- any RPC — restore-fallback and rollback only move pointers/status.
-- ---------------------------------------------------------------------------
create table if not exists public.editor_versions (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references public.editor_documents (id) on delete cascade,
  version_no       integer not null,
  content_type     text not null check (content_type in ('richtext','text','faq')),
  content_json     jsonb not null,
  content_text     text not null default '',
  seo_title        text,
  seo_description  text,
  status           text not null default 'draft'
                     check (status in ('draft','published','superseded','archived')),
  created_by       text not null,          -- admin email
  published_by     text,                   -- admin email
  published_at     timestamptz,
  archived_at      timestamptz,
  created_at       timestamptz not null default now()
);

create unique index if not exists editor_versions_doc_no_unique
  on public.editor_versions (document_id, version_no);

create index if not exists editor_versions_doc_idx
  on public.editor_versions (document_id, version_no desc);

alter table public.editor_versions enable row level security;

-- pointer FKs added after both tables exist (circular reference)
alter table public.editor_documents
  drop constraint if exists editor_documents_published_fk;
alter table public.editor_documents
  add constraint editor_documents_published_fk
  foreign key (published_version_id) references public.editor_versions (id) on delete set null;
alter table public.editor_documents
  drop constraint if exists editor_documents_draft_fk;
alter table public.editor_documents
  add constraint editor_documents_draft_fk
  foreign key (draft_version_id) references public.editor_versions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- editor_media: inline content images. Distinct from the Photo Desk slots
-- (hero/gallery/picks stay Photo-Desk-authoritative). Every row carries the
-- rights confirmation, attribution, and complete upload evidence. Storage
-- objects are NEVER deleted automatically when content is unpublished.
-- ---------------------------------------------------------------------------
create table if not exists public.editor_media (
  id               uuid primary key default gen_random_uuid(),
  storage_path     text not null unique,   -- editorial-photos bucket path (editor/…)
  public_url       text not null,
  alt_text         text not null,
  caption          text,
  attribution_text text not null,
  source_kind      text not null check (source_kind in ('owned','photo_asset')),
  photo_asset_id   uuid references public.photo_assets (id) on delete set null,
  rights_confirmed boolean not null default false,
  width            integer,
  height           integer,
  uploaded_by      text not null,          -- admin email
  evidence_json    jsonb,                  -- original filename/format/bytes, processed stats
  created_at       timestamptz not null default now()
);

alter table public.editor_media enable row level security;

-- ---------------------------------------------------------------------------
-- verification_events action extension: editor rollback / restore-fallback /
-- media upload join the existing audited action set (0009 base, 0012 ext).
-- ---------------------------------------------------------------------------
alter table public.verification_events
  drop constraint if exists verification_events_action_check;
alter table public.verification_events
  add constraint verification_events_action_check
  check (action in ('verify','approve','reject','needs_research','publish','unpublish',
                    'create','update','archive','rollback','restore_fallback','upload'));

-- ---------------------------------------------------------------------------
-- SAVE DRAFT: optimistic-concurrency draft write + audit, atomically.
-- p_base_version is the version_no the editor loaded (draft if one existed,
-- else published, else 0) — a mismatch means someone else saved first.
-- ---------------------------------------------------------------------------
create or replace function public.editor_save_draft(
  p_route           text,
  p_region_key      text,
  p_content_type    text,
  p_content_json    jsonb,
  p_content_text    text,
  p_seo_title       text,
  p_seo_description text,
  p_base_version    integer,
  p_admin_email     text
) returns table (document_id uuid, version_no integer)
language plpgsql
as $$
declare
  d public.editor_documents%rowtype;
  v_expected integer;
  v_next     integer;
  v_id       uuid;
  v_first    boolean := false;
begin
  if coalesce(trim(p_admin_email), '') = '' then
    raise exception 'admin email is required';
  end if;
  if p_content_type not in ('richtext','text','faq') then
    raise exception 'unknown content type %', p_content_type;
  end if;

  insert into public.editor_documents (route, region_key)
  values (p_route, p_region_key)
  on conflict (route, region_key) do nothing;

  select * into d from public.editor_documents
   where route = p_route and region_key = p_region_key
   for update;

  -- what the client must have loaded: the live draft, else the published
  -- version, else nothing (0)
  select coalesce(
           (select ev.version_no from public.editor_versions ev where ev.id = d.draft_version_id),
           (select ev.version_no from public.editor_versions ev where ev.id = d.published_version_id),
           0)
    into v_expected;
  if coalesce(p_base_version, -1) <> v_expected then
    raise exception 'version conflict — this region changed since you loaded it (expected v%, got v%)',
      v_expected, coalesce(p_base_version, -1);
  end if;

  select coalesce(max(ev.version_no), 0) + 1 into v_next
    from public.editor_versions ev where ev.document_id = d.id;
  v_first := (v_next = 1);

  -- the previous unsaved draft is superseded by this one (history kept)
  if d.draft_version_id is not null then
    update public.editor_versions set status = 'superseded'
     where id = d.draft_version_id and status = 'draft';
  end if;

  insert into public.editor_versions
    (document_id, version_no, content_type, content_json, content_text,
     seo_title, seo_description, status, created_by)
  values
    (d.id, v_next, p_content_type, p_content_json, coalesce(p_content_text, ''),
     nullif(trim(coalesce(p_seo_title, '')), ''),
     nullif(trim(coalesce(p_seo_description, '')), ''),
     'draft', trim(p_admin_email))
  returning id into v_id;

  update public.editor_documents set draft_version_id = v_id where id = d.id;

  insert into public.verification_events
    (entity_type, entity_slug, verified_by, verification_method, action, notes)
  values
    ('editor_region', p_route || '#' || p_region_key, trim(p_admin_email), 'admin_review',
     case when v_first then 'create' else 'update' end,
     'draft v' || v_next || ' saved');

  return query select d.id, v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- PUBLISH: the current draft becomes the published override + audit,
-- atomically. Prior published version is preserved as 'superseded'.
-- ---------------------------------------------------------------------------
create or replace function public.editor_publish(
  p_route        text,
  p_region_key   text,
  p_version_no   integer,
  p_admin_email  text
) returns integer
language plpgsql
as $$
declare
  d public.editor_documents%rowtype;
  v public.editor_versions%rowtype;
begin
  if coalesce(trim(p_admin_email), '') = '' then
    raise exception 'admin email is required';
  end if;

  select * into d from public.editor_documents
   where route = p_route and region_key = p_region_key
   for update;
  if not found then
    raise exception 'region %#% has no document', p_route, p_region_key;
  end if;
  if d.draft_version_id is null then
    raise exception 'region has no draft to publish';
  end if;

  select * into v from public.editor_versions
   where id = d.draft_version_id for update;
  if v.version_no <> p_version_no then
    raise exception 'version conflict — the draft is v%, you asked to publish v%', v.version_no, p_version_no;
  end if;

  if d.published_version_id is not null then
    update public.editor_versions set status = 'superseded'
     where id = d.published_version_id and status = 'published';
  end if;

  update public.editor_versions
     set status = 'published', published_by = trim(p_admin_email), published_at = now()
   where id = v.id;

  update public.editor_documents
     set published_version_id = v.id, draft_version_id = null
   where id = d.id;

  insert into public.verification_events
    (entity_type, entity_slug, verified_by, verification_method, action, notes)
  values
    ('editor_region', p_route || '#' || p_region_key, trim(p_admin_email), 'admin_review',
     'publish', 'v' || v.version_no || ' published');

  return v.version_no;
end;
$$;

-- ---------------------------------------------------------------------------
-- ROLLBACK: republish an earlier version's content as a NEW version (history
-- stays append-only and the audit trail shows exactly what happened).
-- ---------------------------------------------------------------------------
create or replace function public.editor_rollback(
  p_route             text,
  p_region_key        text,
  p_target_version_no integer,
  p_admin_email       text
) returns integer
language plpgsql
as $$
declare
  d public.editor_documents%rowtype;
  t public.editor_versions%rowtype;
  v_next integer;
  v_id   uuid;
begin
  if coalesce(trim(p_admin_email), '') = '' then
    raise exception 'admin email is required';
  end if;

  select * into d from public.editor_documents
   where route = p_route and region_key = p_region_key
   for update;
  if not found then
    raise exception 'region %#% has no document', p_route, p_region_key;
  end if;

  select * into t from public.editor_versions
   where document_id = d.id and version_no = p_target_version_no;
  if not found then
    raise exception 'version v% not found', p_target_version_no;
  end if;
  if d.published_version_id = t.id then
    raise exception 'v% is already the published version', p_target_version_no;
  end if;

  select coalesce(max(ev.version_no), 0) + 1 into v_next
    from public.editor_versions ev where ev.document_id = d.id;

  if d.published_version_id is not null then
    update public.editor_versions set status = 'superseded'
     where id = d.published_version_id and status = 'published';
  end if;

  insert into public.editor_versions
    (document_id, version_no, content_type, content_json, content_text,
     seo_title, seo_description, status, created_by, published_by, published_at)
  values
    (d.id, v_next, t.content_type, t.content_json, t.content_text,
     t.seo_title, t.seo_description, 'published', trim(p_admin_email),
     trim(p_admin_email), now())
  returning id into v_id;

  update public.editor_documents set published_version_id = v_id where id = d.id;

  insert into public.verification_events
    (entity_type, entity_slug, verified_by, verification_method, action, notes)
  values
    ('editor_region', p_route || '#' || p_region_key, trim(p_admin_email), 'admin_review',
     'rollback', 'v' || p_target_version_no || ' republished as v' || v_next);

  return v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- RESTORE CODE FALLBACK: clear the published pointer only. History and
-- media are preserved; the page renders its code-owned content again.
-- ---------------------------------------------------------------------------
create or replace function public.editor_restore_fallback(
  p_route       text,
  p_region_key  text,
  p_admin_email text
) returns void
language plpgsql
as $$
declare
  d public.editor_documents%rowtype;
  v_no integer;
begin
  if coalesce(trim(p_admin_email), '') = '' then
    raise exception 'admin email is required';
  end if;

  select * into d from public.editor_documents
   where route = p_route and region_key = p_region_key
   for update;
  if not found then
    raise exception 'region %#% has no document', p_route, p_region_key;
  end if;
  if d.published_version_id is null then
    raise exception 'region has no published override — the code fallback is already live';
  end if;

  select ev.version_no into v_no from public.editor_versions ev where ev.id = d.published_version_id;

  update public.editor_versions set status = 'superseded'
   where id = d.published_version_id and status = 'published';

  update public.editor_documents set published_version_id = null where id = d.id;

  insert into public.verification_events
    (entity_type, entity_slug, verified_by, verification_method, action, notes)
  values
    ('editor_region', p_route || '#' || p_region_key, trim(p_admin_email), 'admin_review',
     'restore_fallback', 'published override v' || coalesce(v_no, 0) || ' cleared — code fallback live');
end;
$$;

-- ---------------------------------------------------------------------------
-- ARCHIVE DRAFT: park the working draft without publishing anything.
-- ---------------------------------------------------------------------------
create or replace function public.editor_archive_draft(
  p_route       text,
  p_region_key  text,
  p_admin_email text
) returns void
language plpgsql
as $$
declare
  d public.editor_documents%rowtype;
  v_no integer;
begin
  if coalesce(trim(p_admin_email), '') = '' then
    raise exception 'admin email is required';
  end if;

  select * into d from public.editor_documents
   where route = p_route and region_key = p_region_key
   for update;
  if not found then
    raise exception 'region %#% has no document', p_route, p_region_key;
  end if;
  if d.draft_version_id is null then
    raise exception 'region has no draft to archive';
  end if;

  select ev.version_no into v_no from public.editor_versions ev where ev.id = d.draft_version_id;

  update public.editor_versions
     set status = 'archived', archived_at = now()
   where id = d.draft_version_id;

  update public.editor_documents set draft_version_id = null where id = d.id;

  insert into public.verification_events
    (entity_type, entity_slug, verified_by, verification_method, action, notes)
  values
    ('editor_region', p_route || '#' || p_region_key, trim(p_admin_email), 'admin_review',
     'archive', 'draft v' || coalesce(v_no, 0) || ' archived');
end;
$$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (documentation only — never run casually; verification_events
-- rows are audit history and are never rewritten or deleted):
--
--   drop function if exists public.editor_archive_draft(text, text, text);
--   drop function if exists public.editor_restore_fallback(text, text, text);
--   drop function if exists public.editor_rollback(text, text, integer, text);
--   drop function if exists public.editor_publish(text, text, integer, text);
--   drop function if exists public.editor_save_draft(text, text, text, jsonb, text, text, text, integer, text);
--   drop table if exists public.editor_media;
--   alter table public.editor_documents drop constraint if exists editor_documents_published_fk;
--   alter table public.editor_documents drop constraint if exists editor_documents_draft_fk;
--   drop table if exists public.editor_versions;
--   drop table if exists public.editor_documents;
--   alter table public.verification_events drop constraint verification_events_action_check;
--   alter table public.verification_events add constraint verification_events_action_check
--     check (action in ('verify','approve','reject','needs_research','publish','unpublish',
--                       'create','update','archive'));
-- ---------------------------------------------------------------------------
