-- Discover DFW · Phase 10: saved searches ("standing orders") full shape.
-- Run in Supabase Dashboard → SQL Editor. Existing rows are preserved.

alter table public.saved_searches
  add column if not exists city_slug text,
  add column if not exists email_enabled boolean not null default true,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_notified_at timestamptz;

-- normalize legacy frequency labels to the enum values
update public.saved_searches set frequency = case frequency
  when 'Instant' then 'instant'
  when 'Daily digest' then 'daily'
  when 'Weekly letter' then 'weekly'
  when 'instant' then 'instant'
  when 'daily' then 'daily'
  when 'weekly' then 'weekly'
  when 'off' then 'off'
  else 'daily'
end;

alter table public.saved_searches drop constraint if exists saved_searches_frequency_check;
alter table public.saved_searches add constraint saved_searches_frequency_check
  check (frequency in ('instant', 'daily', 'weekly', 'off'));

-- backfill city scope from the stored filters
update public.saved_searches
  set city_slug = filters->>'citySlug'
  where city_slug is null and filters ? 'citySlug';

-- RLS: the owner-scoped ALL policy from 0001 already covers these columns.
