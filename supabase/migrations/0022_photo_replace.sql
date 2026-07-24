-- 0022_photo_replace.sql — atomic live-photo REPLACEMENT (CI-6 extension)
-- The 0010/0011 approve RPC refuses when a slot already has a live asset,
-- so replacing a published photo used to require UNPUBLISH → APPROVE: two
-- transactions with a window where the public page renders a blank
-- placeholder. This migration adds ONE narrowly scoped transactional RPC
-- that swaps the live asset in place — the slot goes from old photo to new
-- photo with no moment in between, and photo_assets' UNIQUE(photo_slot_id)
-- keeps "exactly one live asset per slot" a database invariant throughout.
--
-- Narrow by design: only PENDING 'manual_upload' candidates with complete
-- evidence (license, storage_path, rights confirmation recorded at upload)
-- can replace a live photo. Provider-sourced candidates (wikimedia/
-- openverse/…) keep the deliberate two-step: unpublish, then the reviewed
-- CI-6 approve. Nothing here weakens the approve RPC, RLS (no policies on
-- any photo table — service key only), or the audit trail: the replaced
-- asset's candidate row, storage object, and verification_events history
-- all survive, and the replacement itself writes an honest 'replace' event
-- naming both the outgoing and incoming records.
--
-- ⚠ NOT applied automatically. Apply via the dashboard SQL editor with
-- explicit approval (byte-exact procedure, same as 0009–0021). Until
-- applied: the REPLACE actions surface "function does not exist" and no
-- replacement can write anything; approve/unpublish behave exactly as
-- before.

-- ---------------------------------------------------------------------------
-- 1. verification_events action extension: 'replace' joins the audited set
--    (0009 base, 0012 + 0018 extensions — list below preserves all of them).
-- ---------------------------------------------------------------------------
alter table public.verification_events
  drop constraint if exists verification_events_action_check;
alter table public.verification_events
  add constraint verification_events_action_check
  check (action in ('verify','approve','reject','needs_research','publish','unpublish',
                    'create','update','archive','rollback','restore_fallback','upload',
                    'replace'));

-- ---------------------------------------------------------------------------
-- 2. REPLACE: pending manual_upload candidate → the slot's LIVE asset row,
--    atomically (row locks on candidate, slot, and asset). The asset row is
--    UPDATEd in place — never deleted and re-inserted — so there is no
--    instant without a live asset and the row id stays stable. The outgoing
--    candidate returns to 'pending' (same convention as unpublish: history
--    kept, re-approvable later); the incoming candidate becomes 'approved'.
--
--    p_slot_id is required and cross-checked against the candidate's own
--    slot — a caller can never replace a slot with another slot's photo.
--
--    Idempotent for retries: if the candidate is already 'approved' AND is
--    already the slot's selected candidate, the call returns the existing
--    asset id without writing anything.
-- ---------------------------------------------------------------------------
create or replace function public.replace_photo_asset(
  p_candidate_id     uuid,
  p_slot_id          uuid,
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
  a public.photo_assets%rowtype;
  v_storage_path text;
  v_old_candidate uuid;
  v_old_url text;
begin
  if coalesce(trim(p_admin_email), '') = '' then
    raise exception 'admin email is required';
  end if;

  select * into c from public.photo_candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'candidate % not found', p_candidate_id;
  end if;
  if c.photo_slot_id <> p_slot_id then
    raise exception 'candidate belongs to a different slot — refusing to replace across slots';
  end if;

  select * into s from public.photo_slots where id = p_slot_id for update;
  if not found then
    raise exception 'slot % not found', p_slot_id;
  end if;

  select * into a from public.photo_assets where photo_slot_id = s.id for update;
  if not found then
    raise exception 'slot has no live asset — use approve_photo_candidate to fill an empty slot';
  end if;

  -- retry safety: this exact replacement already happened
  if c.status = 'approved' and a.selected_candidate_id = c.id then
    return a.id;
  end if;

  if c.status <> 'pending' then
    raise exception 'candidate is % — only pending candidates can replace a live photo', c.status;
  end if;
  if c.source <> 'manual_upload' then
    raise exception 'only rights-confirmed manual uploads can replace a live photo — unpublish first for % candidates', c.source;
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
  v_storage_path := nullif(c.raw_api_response->'result'->>'storage_path', '');
  if v_storage_path is null then
    raise exception 'manual_upload candidate is missing storage_path evidence';
  end if;
  if coalesce(c.raw_api_response->'result'->>'rights_confirmed', '') <> 'true' then
    raise exception 'candidate is missing rights-confirmation evidence — refusing to publish';
  end if;

  v_old_candidate := a.selected_candidate_id;
  v_old_url := a.public_image_url;

  -- the swap: one UPDATE, no window without a live asset
  update public.photo_assets
     set selected_candidate_id = c.id,
         public_image_url      = c.image_url,
         storage_path          = v_storage_path,
         alt_text              = trim(p_alt_text),
         caption               = nullif(trim(coalesce(p_caption, '')), ''),
         attribution_text      = trim(p_attribution_text),
         attribution_html      = c.attribution_html,
         source_page_url       = c.source_page_url,
         license               = c.license,
         width                 = c.width,
         height                = c.height,
         approved_by           = trim(p_admin_email),
         approved_at           = now(),
         last_verified_at      = null
   where id = a.id;

  -- outgoing candidate returns to the queue (unpublish convention) — its
  -- evidence, storage object, and audit rows are untouched
  if v_old_candidate is not null then
    update public.photo_candidates
       set status = 'pending'
     where id = v_old_candidate and status = 'approved';
  end if;

  update public.photo_candidates
     set status = 'approved', license_verified = true
   where id = c.id;

  update public.photo_slots set status = 'approved' where id = s.id;

  insert into public.verification_events
    (entity_type, entity_slug, verified_by, verification_method, action, notes)
  values
    (s.entity_type, s.entity_slug, trim(p_admin_email), 'admin_review', 'replace',
     'asset ' || a.id || ' now candidate ' || c.id || ' (manual_upload · ' || coalesce(c.license, '') ||
     ' · ' || v_storage_path || ') — previously candidate ' || coalesce(v_old_candidate::text, 'none') ||
     ' · ' || coalesce(v_old_url, ''));

  return a.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (documentation only — never run casually; verification_events
-- rows are audit history and are never rewritten or deleted):
--
--   drop function if exists public.replace_photo_asset(uuid, uuid, text, text, text, text);
--   alter table public.verification_events drop constraint verification_events_action_check;
--   alter table public.verification_events add constraint verification_events_action_check
--     check (action in ('verify','approve','reject','needs_research','publish','unpublish',
--                       'create','update','archive','rollback','restore_fallback','upload'));
-- ---------------------------------------------------------------------------
