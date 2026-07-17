-- School DISTRICT search + MLS-authoritative autocomplete facets.
--
-- 0016 added indexed school-NAME columns. This adds the three RESO school-
-- DISTRICT fields as generated columns (auto-maintained on sync, like the
-- school names) with pg_trgm GIN indexes, so a district ILIKE is fast, and
-- a facets function that lists the DISTINCT school/district values actually
-- reported across the searchable (on-market) population — the authoritative
-- source for autocomplete, replacing the editorial school list.
--
-- Requires the school/district fields to be present in `raw`; run a full
-- backfill (?full=1) so historical rows (synced before the school SELECT)
-- populate. pg_trgm already installed by 0016.

alter table public.listings
  add column if not exists high_school_district text
    generated always as (raw->>'HighSchoolDistrict') stored,
  add column if not exists middle_school_district text
    generated always as (raw->>'MiddleOrJuniorSchoolDistrict') stored,
  add column if not exists elementary_school_district text
    generated always as (raw->>'ElementarySchoolDistrict') stored;

create index if not exists listings_high_school_district_trgm
  on public.listings using gin (high_school_district gin_trgm_ops);
create index if not exists listings_middle_school_district_trgm
  on public.listings using gin (middle_school_district gin_trgm_ops);
create index if not exists listings_elementary_school_district_trgm
  on public.listings using gin (elementary_school_district gin_trgm_ops);

-- Distinct school + district facets over the on-market (searchable) set.
-- Returns ONE jsonb value (no PostgREST 1,000-row cap), cached by the app.
-- Schools are keyed by (level, name); districts are deduped per listing so a
-- home reporting the same district in several fields counts once. Names are
-- the canonical MLS-reported strings (the authoritative display value).
create or replace function public.mls_school_facets()
returns jsonb
language sql
stable
as $$
  with onmarket as (
    select listing_key, high_school, middle_school, elementary_school,
           high_school_district, middle_school_district, elementary_school_district
    from public.listings
    where standard_status in ('Active','ActiveUnderContract','ComingSoon','Pending')
  ),
  schools as (
    select 'high'::text as level, high_school as name, count(*)::int as n
      from onmarket where high_school is not null and high_school <> '' group by high_school
    union all
    select 'middle', middle_school, count(*)::int
      from onmarket where middle_school is not null and middle_school <> '' group by middle_school
    union all
    select 'elementary', elementary_school, count(*)::int
      from onmarket where elementary_school is not null and elementary_school <> '' group by elementary_school
  ),
  district_pairs as (
    select listing_key, high_school_district as name from onmarket where high_school_district is not null and high_school_district <> ''
    union all
    select listing_key, middle_school_district from onmarket where middle_school_district is not null and middle_school_district <> ''
    union all
    select listing_key, elementary_school_district from onmarket where elementary_school_district is not null and elementary_school_district <> ''
  ),
  districts as (
    select name, count(distinct listing_key)::int as n from district_pairs group by name
  )
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(jsonb_build_object('level', level, 'name', name, 'n', n) order by n desc) from schools), '[]'::jsonb),
    'districts', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'n', n) order by n desc) from districts), '[]'::jsonb)
  );
$$;
