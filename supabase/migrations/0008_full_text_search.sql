-- Fix for intermittent /homes?q= timeouts: the ilike keyword filter
-- seq-scans and detoasts every row's public_remarks (~31k × up to 4KB),
-- riding the statement-timeout line. Replace with real full-text search:
-- a GENERATED tsvector column (auto-maintained on every sync upsert — no
-- sync-job changes needed) plus a GIN index.

alter table public.listings
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector(
      'english',
      coalesce(public_remarks, '') || ' ' ||
      coalesce(unparsed_address, '') || ' ' ||
      coalesce(subdivision, '') || ' ' ||
      coalesce(city, '')
    )
  ) stored;

create index if not exists listings_tsv_idx on public.listings using gin (search_tsv);
