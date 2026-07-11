-- 0010_photo_review_rpc.sql — Content Intelligence CI-6
-- Atomic review actions for the admin photo queue. Supabase JS cannot wrap
-- multi-statement sequences in a transaction, so each action is a plpgsql
-- function: every write inside succeeds or the whole action rolls back —
-- photo_assets can never exist while the candidate/slot/events disagree.
--
-- ⚠ NOT applied automatically. Apply via the dashboard SQL editor with
-- explicit approval, after the CI-6 merge (same procedure as 0009).
-- Until applied, the admin API surfaces "function does not exist" and no
-- review action can write anything.
--
-- v1 source allowlist: only wikimedia/openverse candidates are approvable.
-- Pexels/Unsplash have provider-specific publish obligations (Unsplash:
-- hotlink + download-tracking ping; Pexels: prominent credit link) that are
-- not implemented yet — the function refuses them at the deepest layer.

-- ---------------------------------------------------------------------------
-- APPROVE: candidate → photo_assets + slot approved + audit event, atomically
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
  if c.source not in ('wikimedia', 'openverse') then
    raise exception 'source % is not approvable in v1 — publish obligations not implemented', c.source;
  end if;
  if coalesce(trim(p_alt_text), '') = '' then
    raise exception 'alt_text is required';
  end if;
  if coalesce(trim(p_attribution_text), '') = '' then
    raise exception 'attribution_text is required';
  end if;
  if c.source_page_url is null or coalesce(trim(c.license), '') = '' then
    raise exception 'candidate is missing license or source-page evidence';
  end if;

  select * into s from public.photo_slots where id = c.photo_slot_id for update;
  if not found then
    raise exception 'slot % not found', c.photo_slot_id;
  end if;
  if exists (select 1 from public.photo_assets where photo_slot_id = s.id) then
    raise exception 'slot already has an approved asset — unpublish it first';
  end if;

  insert into public.photo_assets
    (photo_slot_id, selected_candidate_id, public_image_url, alt_text, caption,
     attribution_text, attribution_html, source_page_url, license, width, height, approved_by)
  values
    (s.id, c.id, c.image_url, trim(p_alt_text), nullif(trim(coalesce(p_caption, '')), ''),
     trim(p_attribution_text), c.attribution_html, c.source_page_url, c.license, c.width, c.height,
     trim(p_admin_email))
  returning id into v_asset_id;

  -- the reviewer's source-page check IS the license verification
  update public.photo_candidates
     set status = 'approved', license_verified = true
   where id = c.id;

  update public.photo_slots set status = 'approved' where id = s.id;

  insert into public.verification_events
    (entity_type, entity_slug, verified_by, verification_method, action, notes)
  values
    (s.entity_type, s.entity_slug, trim(p_admin_email), 'admin_review', 'approve',
     'candidate ' || c.id || ' · ' || c.source || ' · ' || coalesce(c.license, '') ||
     ' · ' || coalesce(c.source_page_url, ''));

  return v_asset_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- REJECT: candidate rejected (+ slot back to missing when nothing pending
-- remains, so future sourcing re-qualifies it) + audit event, atomically
-- ---------------------------------------------------------------------------
create or replace function public.reject_photo_candidate(
  p_candidate_id uuid,
  p_reason       text,
  p_admin_email  text
) returns void
language plpgsql
as $$
declare
  c public.photo_candidates%rowtype;
  s public.photo_slots%rowtype;
begin
  if coalesce(trim(p_admin_email), '') = '' then
    raise exception 'admin email is required';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a rejection reason is required';
  end if;

  select * into c from public.photo_candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'candidate % not found', p_candidate_id;
  end if;
  if c.status not in ('pending', 'needs_research') then
    raise exception 'candidate is % — only pending/needs_research candidates can be rejected', c.status;
  end if;

  select * into s from public.photo_slots where id = c.photo_slot_id for update;

  update public.photo_candidates
     set status = 'rejected', rejected_reason = trim(p_reason)
   where id = c.id;

  -- last live candidate gone → slot becomes missing again (re-sourceable)
  if s.status = 'candidates_found' and not exists (
    select 1 from public.photo_candidates
     where photo_slot_id = s.id and status in ('pending', 'needs_research') and id <> c.id
  ) then
    update public.photo_slots set status = 'missing' where id = s.id;
  end if;

  insert into public.verification_events
    (entity_type, entity_slug, verified_by, verification_method, action, notes)
  values
    (s.entity_type, s.entity_slug, trim(p_admin_email), 'admin_review', 'reject',
     'candidate ' || c.id || ' · ' || trim(p_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- NEEDS RESEARCH: park a candidate + audit event, atomically
-- ---------------------------------------------------------------------------
create or replace function public.mark_candidate_needs_research(
  p_candidate_id uuid,
  p_notes        text,
  p_admin_email  text
) returns void
language plpgsql
as $$
declare
  c public.photo_candidates%rowtype;
  s public.photo_slots%rowtype;
begin
  if coalesce(trim(p_admin_email), '') = '' then
    raise exception 'admin email is required';
  end if;

  select * into c from public.photo_candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'candidate % not found', p_candidate_id;
  end if;
  if c.status <> 'pending' then
    raise exception 'candidate is % — only pending candidates can be parked', c.status;
  end if;

  select * into s from public.photo_slots where id = c.photo_slot_id;

  update public.photo_candidates set status = 'needs_research' where id = c.id;

  insert into public.verification_events
    (entity_type, entity_slug, verified_by, verification_method, action, notes)
  values
    (s.entity_type, s.entity_slug, trim(p_admin_email), 'admin_review', 'needs_research',
     'candidate ' || c.id || coalesce(' · ' || nullif(trim(coalesce(p_notes, '')), ''), ''));
end;
$$;

-- ---------------------------------------------------------------------------
-- UNPUBLISH: delete the asset, slot back to candidates_found, candidate back
-- to pending (re-approvable or rejectable) + audit event, atomically
-- ---------------------------------------------------------------------------
create or replace function public.unpublish_photo_slot(
  p_slot_id     uuid,
  p_notes       text,
  p_admin_email text
) returns void
language plpgsql
as $$
declare
  s public.photo_slots%rowtype;
  a public.photo_assets%rowtype;
begin
  if coalesce(trim(p_admin_email), '') = '' then
    raise exception 'admin email is required';
  end if;

  select * into s from public.photo_slots where id = p_slot_id for update;
  if not found then
    raise exception 'slot % not found', p_slot_id;
  end if;
  if s.status <> 'approved' then
    raise exception 'slot is % — only approved slots can be unpublished', s.status;
  end if;

  select * into a from public.photo_assets where photo_slot_id = s.id for update;
  if not found then
    raise exception 'slot has no asset row — inconsistent state, investigate before writing';
  end if;

  if a.selected_candidate_id is not null then
    update public.photo_candidates
       set status = 'pending'
     where id = a.selected_candidate_id and status = 'approved';
  end if;

  delete from public.photo_assets where id = a.id;
  update public.photo_slots set status = 'candidates_found' where id = s.id;

  insert into public.verification_events
    (entity_type, entity_slug, verified_by, verification_method, action, notes)
  values
    (s.entity_type, s.entity_slug, trim(p_admin_email), 'admin_review', 'unpublish',
     'asset ' || a.id || ' removed' || coalesce(' · ' || nullif(trim(coalesce(p_notes, '')), ''), ''));
end;
$$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (documentation only — never run casually; each drop disables the
-- corresponding admin review action until re-applied):
--
-- drop function if exists public.approve_photo_candidate(uuid, text, text, text, text);
-- drop function if exists public.reject_photo_candidate(uuid, text, text);
-- drop function if exists public.mark_candidate_needs_research(uuid, text, text);
-- drop function if exists public.unpublish_photo_slot(uuid, text, text);
-- ---------------------------------------------------------------------------
