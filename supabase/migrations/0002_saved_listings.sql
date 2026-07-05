-- Discover DFW · Phase 8: saved_homes -> saved_listings with the full shape.
-- Run in Supabase Dashboard → SQL Editor. Existing rows are preserved.

alter table public.saved_homes rename to saved_listings;
alter table public.saved_listings rename column saved_at to created_at;

-- surrogate id becomes the primary key; (user_id, listing_key) stays unique
alter table public.saved_listings add column if not exists id uuid not null default gen_random_uuid();
alter table public.saved_listings drop constraint saved_homes_pkey;
alter table public.saved_listings add primary key (id);
alter table public.saved_listings
  add constraint saved_listings_user_listing_unique unique (user_id, listing_key);

-- provenance + notes + change-detection fields
alter table public.saved_listings add column if not exists source_page text;
alter table public.saved_listings add column if not exists notes text;
alter table public.saved_listings add column if not exists last_seen_status text;
alter table public.saved_listings add column if not exists last_seen_price integer;

-- seed last-seen price from the save-time price (price_at_save is kept:
-- it anchors "price cut since you saved"; last_seen_* anchors "since you
-- last looked" and future alerts)
update public.saved_listings set last_seen_price = price_at_save where last_seen_price is null;

create index if not exists saved_listings_user_idx on public.saved_listings (user_id, created_at desc);

-- refresh RLS under the new name (owner-scoped CRUD, nothing cross-user)
drop policy if exists "saved_homes_all_own" on public.saved_listings;
drop policy if exists "saved_listings_all_own" on public.saved_listings;
create policy "saved_listings_all_own" on public.saved_listings
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.saved_listings enable row level security;
