-- Fix for the /homes hang: the default "newest" sort ordered by
-- raw->CumulativeDaysOnMarket, detoasting every matching row's jsonb
-- (~30k rows) and blowing the statement timeout. Promote DOM to a real
-- integer column: indexed, cheap to sort, no jsonb on the hot path.

alter table public.listings add column if not exists days_on_market integer;

-- one-time backfill from the replicated raw payload
update public.listings
set days_on_market = nullif(raw->>'CumulativeDaysOnMarket', '')::integer
where days_on_market is null
  and raw ? 'CumulativeDaysOnMarket';

create index if not exists listings_dom_idx on public.listings (days_on_market asc nulls last);
