-- 0020_visual_builder_savedraft.sql — Visual Builder Phase 2 hotfix
--
-- 0019 widened the editor_versions.content_type CHECK to include 'layout'
-- and 'nav', but editor_save_draft (defined in 0018) carries its OWN
-- hardcoded type guard — so layout/nav drafts still failed with
-- "unknown content type layout". This re-creates the function byte-for-byte
-- from 0018 with exactly one change: the guard list now matches the 0019
-- constraint ('richtext','text','faq','layout','nav').
--
-- ⚠ NOT applied automatically. Apply via the dashboard SQL editor with
-- explicit approval (same procedure as 0009–0019).

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
  if p_content_type not in ('richtext','text','faq','layout','nav') then
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
-- ROLLBACK (documentation only): re-run the 0018 definition of
-- editor_save_draft (guard list 'richtext','text','faq'). Any existing
-- layout/nav draft rows are untouched either way.
-- ---------------------------------------------------------------------------
