-- Feature Search SEO v1 — structured-field columns for the six feature
-- searches (/homes/with-pool, /homes/3-car-garage, /homes/single-story
-- and their registry-approved city pages). Same pattern as 0016/0017:
-- promote audited RESO fields from the server-only `raw` jsonb to
-- GENERATED columns (auto-maintained on every sync upsert, zero sync-job
-- changes) plus the smallest useful indexes. Purely additive: no existing
-- column or row is modified, and dropping these columns restores the
-- exact prior schema.
--
-- Field audit (2026-07-24, live NTREIS/Trestle + the replicated
-- on-market inventory of 48,657 rows):
--   PoolFeatures  100% populated, comma-joined enums. 'None' on 36,660
--                 rows; private-pool structure tokens (InGround, Gunite,
--                 OutdoorPool, PoolSpaCombo, ...) on ~6,400. The regex
--                 below matches token-bounded STRUCTURE tokens only —
--                 modifier-only rows (e.g. 'Community,Heated' = heated
--                 community pool) can never count as a private pool.
--   Levels        100% populated on residential rows: One 23,032 ·
--                 Two 18,214 · ThreeOrMore 950 · OneAndOneHalf 673 ·
--                 MultiSplit 54 (nulls are Land rows). Single-story
--                 pages use levels = 'One' exactly.
--   GarageSpaces  ~88% populated numerics; >= 3 on 7,508 on-market rows.
--   REJECTED: PoolPrivateYN (1.8% populated) and StoriesTotal (2.7%) —
--   audited and failed the reliability bar; never referenced.
--
-- ⚠ NOT applied automatically. Apply via the dashboard SQL editor with
-- the byte-exact procedure (same as 0009–0022). Until applied: the
-- feature filters return zero rows via the null columns and the feature
-- pages render honest empty states — nothing else breaks.

alter table public.listings
  add column if not exists has_private_pool boolean
    generated always as (
      raw->>'PoolFeatures' ~
        '(^|,)(Pool|InGround|OutdoorPool|AboveGround|Gunite|Fiberglass|Vinyl|Lap|Sport|Infinity|PoolSpaCombo|DivingBoard|PoolSweep|PoolCover|Private|Indoor)(,|$)'
    ) stored,
  add column if not exists garage_spaces numeric
    generated always as (
      case when raw->>'GarageSpaces' ~ '^[0-9]+(\.[0-9]+)?$'
           then (raw->>'GarageSpaces')::numeric end
    ) stored,
  add column if not exists levels text
    generated always as (nullif(raw->>'Levels', '')) stored;

-- Feature queries always carry standard_status (+ usually city) — partial
-- indexes keep them tight and cost nothing on non-feature rows.
create index if not exists listings_pool_idx
  on public.listings (standard_status, city)
  where has_private_pool;
create index if not exists listings_garage_idx
  on public.listings (standard_status, city)
  where garage_spaces >= 3;
create index if not exists listings_levels_one_idx
  on public.listings (standard_status, city)
  where levels = 'One';
-- acreage searches (homes >= 1 acre; /land reuses it for big-lot sorts)
create index if not exists listings_lot_size_idx
  on public.listings (standard_status, lot_size)
  where lot_size >= 1;

-- ---------------------------------------------------------------------------
-- Rollback (manual, comment-only — never executed automatically):
--   drop index if exists public.listings_lot_size_idx;
--   drop index if exists public.listings_levels_one_idx;
--   drop index if exists public.listings_garage_idx;
--   drop index if exists public.listings_pool_idx;
--   alter table public.listings
--     drop column if exists levels,
--     drop column if exists garage_spaces,
--     drop column if exists has_private_pool;
-- ---------------------------------------------------------------------------
