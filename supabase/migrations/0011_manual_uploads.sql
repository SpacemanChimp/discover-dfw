-- 0011_manual_uploads.sql — Content Intelligence CI-7
-- Manual admin photo uploads: a Storage bucket for admin-uploaded editorial
-- photos, and an updated approve RPC so 'manual_upload' candidates publish
-- through the SAME CI-6 pipeline (no second publish path).
--
-- ⚠ NOT applied automatically. Apply via the dashboard SQL editor with
-- explicit approval, after the CI-7 merge (same procedure as 0009/0010).
-- Until applied: uploads fail with "bucket not found" (the route surfaces
-- "has migration 0011 been applied?") and manual_upload candidates refuse
-- to approve — nothing can publish.

-- ---------------------------------------------------------------------------
-- 1. Storage bucket: public READ (the site serves these images); writes
--    happen only server-side via the service key (which bypasses RLS) —
--    no storage.objects policies are added, so anon/authed clients cannot
--    write. v1 keeps processed web-ready files only.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('editorial-photos', 'editorial-photos', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. approve_photo_candidate v2 (replaces 0010's version):
--    * source allowlist gains 'manual_upload' — our own photos carry no
--      external publish obligations (pexels/unsplash stay refused)
--    * source_page_url is required only for EXTERNAL sources; manual
--      uploads have no source page
--    * photo_assets.storage_path is populated from the candidate's
--      evidence (raw_api_response->'result'->>'storage_path') — the
--      candidates table has no storage_path column by design
--    Everything else is byte-identical to 0010's logic.
-- ---------------------------------------------------------------------------
create or replace function public.approve_photo_candidate(
  p_candidate_id     uuid,
  p_alt_text         text,
  p_caption          text,
  p_attribution_text text,
  p_admin_email      text
) returns uuid
language plpgsql
as $$
declare
  c public.photo_candidates%rowtype;
  s public.photo_slots%rowtype;
  v_asset_id uuid;
  v_storage_path text;
begin
  if coalesce(trim(p_admin_email), '') = '' then
    raise exception 'admin email is required';
  end if;

  select * into c from public.photo_candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'candidate % not found', p_candidate_id;
  end if;
  if c.status <> 'pending' then
    raise exception 'candidate is % — only pending candidates can be approved', c.status;
  end if;
  if c.source not in ('wikimedia', 'openverse', 'manual_upload') then
    raise exception 'source % is not approvable in v1 — publish obligations not implemented', c.source;
  end if;
  if coalesce(trim(p_alt_text), '') = '' then
    raise exception 'alt_text is required';
  end if;
  if coalesce(trim(p_attribution_text), '') = '' then
    raise exception 'attribution_text is required';
  end if;
  if coalesce(trim(c.license), '') = '' then
    raise exception 'candidate is missing license evidence';
  end if;
  -- external sources must carry the page a reviewer verified; manual
  -- uploads have no external source page (rights confirmed at upload)
  if c.source <> 'manual_upload' and c.source_page_url is null then
    raise exception 'candidate is missing source-page evidence';
  end if;

  v_storage_path := nullif(c.raw_api_response->'result'->>'storage_path', '');
  if c.source = 'manual_upload' and v_storage_path is null then
    raise exception 'manual_upload candidate is missing storage_path evidence';
  end if;

  select * into s from public.photo_slots where id = c.photo_slot_id for update;
  if not found then
    raise exception 'slot % not found', c.photo_slot_id;
  end if;
  if exists (select 1 from public.photo_assets where photo_slot_id = s.id) then
    raise exception 'slot already has an approved asset — unpublish it first';
  end if;

  insert into public.photo_assets
    (photo_slot_id, selected_candidate_id, public_image_url, storage_path, alt_text, caption,
     attribution_text, attribution_html, source_page_url, license, width, height, approved_by)
  values
    (s.id, c.id, c.image_url, v_storage_path, trim(p_alt_text), nullif(trim(coalesce(p_caption, '')), ''),
     trim(p_attribution_text), c.attribution_html, c.source_page_url, c.license, c.width, c.height,
     trim(p_admin_email))
  returning id into v_asset_id;

  -- the reviewer's verification click (or upload rights confirmation)
  update public.photo_candidates
     set status = 'approved', license_verified = true
   where id = c.id;

  update public.photo_slots set status = 'approved' where id = s.id;

  insert into public.verification_events
    (entity_type, entity_slug, verified_by, verification_method, action, notes)
  values
    (s.entity_type, s.entity_slug, trim(p_admin_email), 'admin_review', 'approve',
     'candidate ' || c.id || ' · ' || c.source || ' · ' || coalesce(c.license, '') ||
     ' · ' || coalesce(c.source_page_url, coalesce(v_storage_path, '')));

  return v_asset_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (documentation only — never run casually):
--
-- * To revert the approve function to its 0010 behavior, re-run the
--   approve_photo_candidate definition from 0010_photo_review_rpc.sql
--   (create or replace overwrites this version).
-- * The bucket: removing it orphans any uploaded assets' image URLs.
--   Only ever with explicit approval and after confirming zero
--   photo_assets rows have storage_path set:
--   -- delete from storage.objects where bucket_id = 'editorial-photos';
--   -- delete from storage.buckets where id = 'editorial-photos';
-- ---------------------------------------------------------------------------
