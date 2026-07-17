-- Cross-city school search. The school filter used to be pinned to a single
-- city because the MLS-reported school name lives inside the unindexed `raw`
-- jsonb: a cross-city `raw->>'HighSchool' ILIKE '%…%'` seq-scans and detoasts
-- every row (~5.5s over ~44k on-market listings), so the original design
-- narrowed to one indexed city first. But schools cross city lines — Guyer
-- High (Denton ISD) serves homes reported in Denton, Lantana, AND Argyle, and
-- the one-city scope hid ~80% of them.
--
-- Fix: promote the three RESO school fields to GENERATED columns (auto-
-- maintained on every sync upsert, exactly like search_tsv in 0008 — no
-- sync-job change) and give each a pg_trgm GIN index so an ILIKE '%token%'
-- is fast city-independently. The provider then drops the city requirement.
create extension if not exists pg_trgm;

alter table public.listings
  add column if not exists high_school text
    generated always as (raw->>'HighSchool') stored,
  add column if not exists middle_school text
    generated always as (raw->>'MiddleOrJuniorSchool') stored,
  add column if not exists elementary_school text
    generated always as (raw->>'ElementarySchool') stored;

create index if not exists listings_high_school_trgm
  on public.listings using gin (high_school gin_trgm_ops);
create index if not exists listings_middle_school_trgm
  on public.listings using gin (middle_school gin_trgm_ops);
create index if not exists listings_elementary_school_trgm
  on public.listings using gin (elementary_school gin_trgm_ops);
