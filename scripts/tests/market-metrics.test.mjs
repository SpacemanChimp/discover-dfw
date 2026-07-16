/* Consistency tests for the canonical market-metric layer (lib/market/core).
   Runs with the built-in runner + TS type-stripping: npm test

   Covers the five reference cities (Denton, Frisco, Northlake, Argyle,
   Aubrey) required by the market-data refactor:
   - one build → identical value & formatting on every surface (the surfaces
     all consume the same CityMarketMetricSet and the same formatters)
   - metrics genuinely absent are OMITTED, never zero-filled
   - YoY exists ONLY with a comparable ~year-old snapshot
   - labels always say what the median measures and cite source + date
   - the canonical model carries every required field
   - editorial fallback is flagged unverified and never fabricates counts/YoY */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EDITORIAL_DATASET_AS_OF,
  fmtAsOf,
  fmtMetricValue,
  fmtPrice,
  medianOf,
  medianOfCityMedians,
  metricsFromEditorial,
  metricsFromSnapshotRow,
  provenanceLabel,
  provenanceLabelShort,
} from "../../lib/market/core.ts";

const dfw = JSON.parse(readFileSync(new URL("../../lib/dfw.data.json", import.meta.url), "utf8"));
const CITY_SLUGS = ["denton", "frisco", "northlake", "argyle", "aubrey"];
const cityOf = (slug) => dfw.cities.find((c) => c.slug === slug);

/* Synthetic authoritative snapshot rows for the five reference cities.
   northlake: no ppsf (null living areas); argyle: no DOM. */
const ROWS = {
  denton: { as_of: "2026-07-15", active_listings: 717, median_list_price: 415000, price_per_sqft: 203, median_days_on_market: 41, created_at: "2026-07-15T13:00:00Z" },
  frisco: { as_of: "2026-07-15", active_listings: 1156, median_list_price: 729000, price_per_sqft: 235, median_days_on_market: 40, created_at: "2026-07-15T13:00:00Z" },
  northlake: { as_of: "2026-07-15", active_listings: 223, median_list_price: 665000, price_per_sqft: null, median_days_on_market: 58, created_at: "2026-07-15T13:00:00Z" },
  argyle: { as_of: "2026-07-15", active_listings: 235, median_list_price: 625000, price_per_sqft: 217, median_days_on_market: null, created_at: "2026-07-15T13:00:00Z" },
  aubrey: { as_of: "2026-07-15", active_listings: 538, median_list_price: 410000, price_per_sqft: 183, median_days_on_market: 55, created_at: "2026-07-15T13:00:00Z" },
};

const REQUIRED_FIELDS = [
  "cityId", "citySlug", "metricType", "value", "unit", "sourceName", "sourceType",
  "asOf", "periodStart", "periodEnd", "geographyDefinition", "propertyScope",
  "listingStatusScope", "calculationMethod", "verified", "lastUpdatedAt",
];

for (const slug of CITY_SLUGS) {
  test(`${slug}: canonical live set is complete, honest, and consistent across surfaces`, () => {
    const city = cityOf(slug);
    assert.ok(city, `${slug} exists in the dataset`);
    const set = metricsFromSnapshotRow(city, ROWS[slug]);

    // authoritative provenance
    assert.equal(set.sourceType, "mls_replica");
    assert.equal(set.sourceName, "NTREIS");

    // median present, correct, fully described
    const m = set.metrics.median_active_list_price;
    assert.ok(m, "median list price present");
    assert.equal(m.value, ROWS[slug].median_list_price);
    assert.equal(m.verified, true);
    assert.equal(m.listingStatusScope, "Active"); // never relabeled as sold data
    for (const f of REQUIRED_FIELDS) {
      assert.ok(m[f] !== undefined && m[f] !== "", `metric field ${f} populated`);
    }

    // genuinely-missing metrics are OMITTED (never 0)
    if (slug === "northlake") assert.equal(set.metrics.median_price_per_sqft, undefined);
    if (slug === "argyle") assert.equal(set.metrics.median_days_on_market, undefined);

    // count is a real metric
    assert.equal(set.metrics.active_listing_count?.value, ROWS[slug].active_listings);

    // NO YoY without comparable history — never fabricated
    assert.equal(set.metrics.yoy_median_list_price_change, undefined);

    // cross-surface consistency: homepage / city report / search mini band /
    // listing chip all format THE SAME metric with THE SAME helper
    const homepage = fmtPrice(set.metrics.median_active_list_price.value);
    const cityReport = fmtMetricValue(set.metrics.median_active_list_price);
    const searchBand = fmtMetricValue(set.metrics.median_active_list_price);
    const listingChip = fmtPrice(set.metrics.median_active_list_price.value);
    assert.equal(homepage, cityReport);
    assert.equal(cityReport, searchBand);
    assert.equal(searchBand, listingChip);

    // the label says what the median measures, when, and from where
    const label = provenanceLabel(set);
    assert.match(label, /ACTIVE LISTINGS/);
    assert.match(label, /MEDIANS OF LIST PRICES/);
    assert.match(label, /UPDATED JUL 15, 2026/);
    assert.match(label, /SOURCE: NTREIS/);
  });

  test(`${slug}: editorial fallback is unverified and never fabricates`, () => {
    const city = cityOf(slug);
    const set = metricsFromEditorial(city);
    assert.equal(set.sourceType, "editorial");
    assert.equal(set.asOf, EDITORIAL_DATASET_AS_OF);
    const m = set.metrics.median_active_list_price;
    assert.ok(m, "editorial median present");
    assert.equal(m.value, city.price); // exactly the dataset value — no drift
    assert.equal(m.verified, false);
    assert.equal(set.metrics.active_listing_count, undefined, "no fabricated count");
    assert.equal(set.metrics.yoy_median_list_price_change, undefined, "no fabricated YoY");
    assert.match(provenanceLabel(set), /EDITORIAL/);
    assert.match(provenanceLabelShort(set), /EDITORIAL/);
  });
}

test("YoY appears only with a comparable ~year-old snapshot", () => {
  const frisco = cityOf("frisco");
  const yearOld = { as_of: "2025-07-16", active_listings: 1000, median_list_price: 662000, price_per_sqft: 230, median_days_on_market: 38 };
  const withHistory = metricsFromSnapshotRow(frisco, ROWS.frisco, yearOld);
  const yoy = withHistory.metrics.yoy_median_list_price_change;
  assert.ok(yoy, "YoY built from comparable history");
  assert.equal(yoy.value, Math.round(((729000 - 662000) / 662000) * 1000) / 10);
  assert.equal(yoy.periodStart, "2025-07-16");
  assert.equal(yoy.periodEnd, "2026-07-15");
  assert.match(fmtMetricValue(yoy), /^\+10\.1%$/);

  // 6-months-old is NOT comparable → omitted
  const tooRecent = { ...yearOld, as_of: "2026-01-15" };
  assert.equal(
    metricsFromSnapshotRow(frisco, ROWS.frisco, tooRecent).metrics.yoy_median_list_price_change,
    undefined
  );
});

test("formatting helpers are stable across magnitudes", () => {
  assert.equal(fmtPrice(415000), "$415K");
  assert.equal(fmtPrice(999499), "$999K");
  assert.equal(fmtPrice(1_050_000), "$1.05M");
  assert.equal(fmtPrice(1_449_000), "$1.45M");
  assert.equal(fmtPrice(2_900_000), "$2.9M");
  assert.equal(fmtAsOf("2026-07-15"), "JUL 15, 2026");
});

test("county/metro aggregate is a defined median-of-city-medians", () => {
  const sets = CITY_SLUGS.map((slug) => metricsFromSnapshotRow(cityOf(slug), ROWS[slug]));
  const agg = medianOfCityMedians(sets);
  // medians: 410, 415, 625, 665, 729 → middle value 625000
  assert.equal(agg, 625000);
  assert.equal(medianOf([]), null); // empty → omitted upstream, never zero
});
