-- Residential school facets — hardening companion to the residential home
-- search. mls_school_facets (0017) counted every on-market row, but 4,737
-- on-market LAND rows report a high school and 4,858 report a district
-- (audited 2026-08-30), so typeahead counts overcounted versus the school
-- SEARCH results, which now cover Residential + ResidentialIncome only.
-- This re-creates the function with the same residential definition the
-- default home search, snapshot writer, and Letter figures use.
--
-- Purely additive in effect: CREATE OR REPLACE of a STABLE sql function;
-- no table, column, row, index, or grant changes; RLS untouched (the
-- function reads as its owner exactly as 0017 did, and only the
-- service-role server calls it). No table rewrite, no long locks —
-- applies in milliseconds and is idempotent (re-running replaces the
-- function with identical text).
--
-- ⚠ NOT applied automatically. Apply via the dashboard SQL editor with
-- the byte-exact procedure, together with 0024 (schema-first, before the
-- app deploy). Until applied: typeahead schol counts run slightly high —
-- cosmetic only.

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
      and property_type in ('Residential','ResidentialIncome')
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

-- ---------------------------------------------------------------------------
-- Rollback (manual, comment-only — never executed automatically):
--   re-run the mls_school_facets() definition from
--   0017_school_district_facets.sql (CREATE OR REPLACE restores the
--   all-property counts).
-- ---------------------------------------------------------------------------
