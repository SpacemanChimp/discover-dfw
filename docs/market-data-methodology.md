# Market data methodology

Every market statistic DiscoverDFW displays comes from **one canonical
layer** — `lib/market` (`core.ts` model + formatters, `metrics.ts` server
binding). No surface keeps its own copy of a market number. This document
defines every displayed metric, its source, cadence, and fallback behavior.

## Authoritative source

**`city_market_snapshots`** in the Supabase NTREIS replica, written by the
MLS sync (`app/api/mls/sync`, Vercel cron **every 15 minutes**; snapshots
recomputed once the replica is caught up, keyed one row per city per day):

- Universe: listings in the local NTREIS replica with
  `standard_status = 'Active'`, matched on the **MLS "City" field = city
  name** (not city limits or school district — the feed's own geography).
- Property scope: everything the sync ingests — **Residential,
  Residential-Income, and Land; rentals excluded**.
- Full paged scan per city (never a sample — PostgREST's 1,000-row cap is
  paged through explicitly).

The IDX/compliance behavior of the feed integration is unchanged by the
metric layer: it only **reads** the replica snapshot table. No sold/closed
data is displayed anywhere; nothing here relabels active-listing data.

## The canonical model

`CityMarketMetric` (lib/market/core.ts): `cityId` (= slug), `citySlug`,
`metricType`, `value`, `unit`, `sourceName`, `sourceType`
(`mls_replica` | `editorial`), `asOf`, `periodStart`, `periodEnd`,
`geographyDefinition`, `propertyScope`, `listingStatusScope`,
`calculationMethod`, `verified` (true only for replica reads),
`lastUpdatedAt`.

## Displayed metrics

| Metric | Definition | Source | Cadence |
|---|---|---|---|
| **Median active list price** | Median of current list prices across all matching active listings (point-in-time) | snapshot `median_list_price` | 15-min sync, daily snapshot row |
| **Median days on market** | Median of MLS `CumulativeDaysOnMarket` across matching active listings | snapshot `median_days_on_market` | same |
| **Active listing count** | Count of matching active listings | snapshot `active_listings` | same |
| **Median $/sqft** | Median of per-listing `list price ÷ living area`; **only listings carrying both values** — omitted when the snapshot has none | snapshot `price_per_sqft` | same |
| **YoY median change** | Percent change of the median vs the snapshot **350–380 days older**; only rendered when such a comparable row exists (no history yet → not rendered anywhere) | two snapshot rows | derived |
| **County / metro price figure** | **Median of city medians** — explicitly *not* a county- or metro-wide listing median; labeled "MEDIAN CITY LIST" / "MEDIAN OF CITY MEDIANS" | derived from the above | same |
| **Residents (StatsBand)** | Sum of the 90 profiled cities' Census Vintage 2024 populations — not the full metro population; labeled as such | editorial dataset (Census) | manual |

**Removed as fabricated (2026-07):** the editorial YoY figure and the
synthetic 12-month sparkline on city reports. They return automatically —
through the canonical layer — once a year of snapshot history exists.

## Surfaces and how they consume the layer

| Surface | Path | Metrics |
|---|---|---|
| Homepage Ticker / CityIndex / StatsBand / InteractiveMap | `app/page.tsx` → `getAllCityMarketMetricSets()` (one bulk read, ISR 900s) | median price (+ ppsf/DOM in the map spotlight) |
| City report hero + "02 Market Snapshot" + nearby-cities chips | `app/city/[slug]` → `getAllCityMarketMetricSets()` | price, ppsf, DOM, count, YoY-when-real |
| City home-search band | `app/city/[slug]/homes` → `getCityMarketMetricSet()` | price, ppsf, DOM, count (+ live Pending/Under-contract head-counts from the provider) |
| Listing "vs city median" chip | `app/listing/[listingKey]` → `getCityMarketMetricSet()` | median price |
| Search rail per-city counts | `provider.getActiveCountsByCity()` (live head-counts, same replica; may differ from the daily snapshot count by up to one sync cycle) | count |

## Update cadence & consistency window

Snapshots update on the 15-minute sync; pages revalidate on ISR windows of
up to 15 minutes. Two surfaces can therefore lag each other by **at most
one sync/ISR cycle**. The publication audit
(`npm run audit:public-content`) enforces cross-surface consistency of the
rendered median (homepage vs city report vs search band, 2% tolerance) —
category `cross-surface-market-conflict`, severity high.

## Fallback behavior

- `MLS_PROVIDER=local/database`: replica snapshot (verified). Missing
  snapshot row for a city → editorial fallback for that city.
- `MLS_PROVIDER=trestle`: city pages read live API medians via the
  provider; bulk surfaces (homepage) use the editorial fallback (90
  parallel feed calls per render would breach etiquette).
- Editorial fallback = `lib/dfw.data.json` `price`/`ppsf`/`dom`, which are
  **snapshot-seeded mirrors** refreshed by
  `scripts/content/refresh-city-market-figures.mjs` (last run 2026-07-15 —
  bump `EDITORIAL_DATASET_AS_OF` in `lib/market/core.ts` when re-running).
  Editorial sets are `verified: false`, labeled EDITORIAL, and never carry
  a listing count or YoY (those would be fabricated).
- A metric the source genuinely lacks is **omitted** — never rendered as
  zero or a guess. Layouts are built to compose with missing tiles.

## Labels (rule: say what the median measures)

Live: `ACTIVE LISTINGS (HOMES, INCOME & LAND) · MEDIANS OF LIST PRICES ·
SOURCE: NTREIS`. Editorial: `EDITORIAL FIGURES · SEEDED FROM NTREIS SNAPSHOT
MEDIANS`. County/metro aggregates are labeled `MEDIAN CITY LIST` /
`MEDIAN OF CITY MEDIANS` with a title attribute spelling out the definition.
Formatting is centralized (`fmtPrice`, `fmtMetricValue`) so a value renders
identically on every surface ($415K under $1M, $1.45M above).

**No retrieval date (owner decision, 2026-07):** the market-stat labels
deliberately carry no "updated/as-of/counted" date — users are not shown
when the data was pulled. The model still tracks `asOf`/`lastUpdatedAt`
internally (used for YoY comparability and freshness logic); it is simply
not rendered. This does NOT touch the per-listing IDX freshness stamp
(`components/compliance/LastUpdatedStamp`), which remains for IDX
compliance.

## Tests

`scripts/tests/market-metrics.test.mjs` (npm test): for Denton, Frisco,
Northlake, Argyle, and Aubrey — model completeness, omission of missing
metrics, no-YoY-without-history (plus the with-history path), editorial
fallback honesty, formatter stability, cross-surface formatting identity,
and the median-of-city-medians aggregate. The publication audit adds the
rendered cross-surface check against a running build.

## Residential market definition (2026-08 hardening)

Every public "home" figure — snapshot medians, price-per-sqft, days on
market, active counts, city status counts, The Letter's actives and
new-in-7-days figures, and the default home-search inventory — covers
PropertyType `Residential` and `ResidentialIncome` ONLY. Vacant land
(`Land`) is never blended into a home-price statistic; land figures live
on /land's own queries. The single source of truth for the type list is
`RESIDENTIAL_PROPERTY_TYPES` in `lib/mls/feature-search.ts` — every query
imports it, and `scripts/tests/feature-search.test.mjs` locks its meaning.

Why it matters: at the 2026-08-30 audit the all-property blend was
materially misleading in mixed markets (Dallas all-property median $399K
vs residential $425K, +6.5%; Denton −2.4% the other way because rural
land lists high). Farms WITH a residence remain included — RESO files
them under `Residential` (sub-type `Farm`); house-less ranchland is
`Land` and stays out.

Transition note: snapshot rows written BEFORE this change blend land.
The first residential-only rows land on the next daily sync after
deployment (or an immediate manual sync). Year-over-year deltas compare
against year-old blended rows until the definition has a year of
history; land is a small share of most cities, and the ±15-day
comparability rule is unchanged.

## Snapshot reads are one consistent, retried read (2026-08 hardening)

`lib/market/metrics.ts` reads city_market_snapshots ONCE per server
process (5-minute memo, 3 bounded retries): two paged windows — the last
14 days for current rows, and the 349–381-day band for year-ago rows —
each paged under PostgREST's hard 1,000-row response cap. This fixed two
audit findings: (1) statically prerendered city pages no longer make ~90
independent fragile reads, so one build can never show two different
medians for the same city (the "median differs across surfaces" class);
(2) the old single-query read silently lost year-old rows to the row cap,
so homepage YoY never attached. If every retry fails, the read fails
CLOSED to the labeled editorial set for every surface together — an
editorial number is never mixed into a replica-sourced build, and the
on-page provenance label always says which source is rendering.
