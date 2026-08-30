/* Feature Search SEO v1 — contract tests for lib/mls/feature-search.ts.
   Locks: every feature's predicate fields, acreage excluding vacant land,
   city+feature conjunction, future-only open-house indexing, registry
   validity, sitemap eligibility, and the noindex decision for arbitrary
   combinations. DB-truth count comparisons run separately against the
   live replica (see the release verification). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FEATURES,
  FEATURE_SLUGS,
  CITY_FEATURE_REGISTRY,
  cityFeaturePublished,
  publishedCitiesFor,
  publishedFeaturesForCity,
  featurePath,
  featureSitemapPaths,
  featureIndexable,
  isFeatureSlug,
  indexOpenHouseEvents,
  applyFeaturePremise,
  defaultPropertyTypes,
} from "../../lib/mls/feature-search.ts";

test("every feature predicate rides its audited structured field", () => {
  assert.deepEqual(FEATURES["with-pool"].filters, { pool: true });
  assert.deepEqual(FEATURES["on-acreage"].filters, { minAcres: 1, residentialOnly: true });
  assert.deepEqual(FEATURES["3-car-garage"].filters, { garageMin: 3 });
  assert.deepEqual(FEATURES["single-story"].filters, { singleStory: true });
  assert.deepEqual(FEATURES["5-plus-bedrooms"].filters, { minBeds: 5 });
  assert.deepEqual(FEATURES["open-houses"].filters, { openHousesOnly: true });
  assert.equal(FEATURE_SLUGS.length, 6);
});

test("home searches default to residential property types (land never leaks)", () => {
  // the default browse, city searches, school/district searches, and every
  // feature page all pass a filter object WITHOUT land/type picks
  assert.deepEqual(defaultPropertyTypes({}), ["Residential", "ResidentialIncome"]);
  assert.deepEqual(defaultPropertyTypes({ citySlug: "frisco", minBeds: 3 }), ["Residential", "ResidentialIncome"]);
  assert.deepEqual(defaultPropertyTypes({ school: "Guyer" }), ["Residential", "ResidentialIncome"]);
  // condos/townhomes/multi-family picks stay inside the residential scope
  assert.deepEqual(defaultPropertyTypes({ propertyType: "Condo" }), ["Residential", "ResidentialIncome"]);
  assert.deepEqual(defaultPropertyTypes({ propertyType: "Multi-family" }), ["Residential", "ResidentialIncome"]);
  // /land and an explicit Land type pick own their type clause — no override
  assert.equal(defaultPropertyTypes({ land: true }), null);
  assert.equal(defaultPropertyTypes({ propertyType: "Land" }), null);
  // acreage pages compose: residentialOnly narrows WITHIN the default scope
  assert.deepEqual(defaultPropertyTypes({ residentialOnly: true, minAcres: 1 }), ["Residential", "ResidentialIncome"]);
});

test("acreage search can never include vacant land", () => {
  const f = FEATURES["on-acreage"].filters;
  assert.equal(f.residentialOnly, true, "must force PropertyType=Residential");
  assert.ok(!("land" in f), "must not set the land flag");
  // and no feature sets remarks/keyword matching
  for (const slug of FEATURE_SLUGS) {
    assert.ok(!("q" in FEATURES[slug].filters), `${slug} must not keyword-match`);
  }
});

test("city + feature predicates always apply together (server merge order)", () => {
  // mirror FeatureRoom's effective-filters merge: user query first, then
  // the feature premise, then the canonical city — tampering loses
  const effective = { citySlug: "dallas", pool: undefined, minBeds: 1 };
  applyFeaturePremise(effective, FEATURES["with-pool"].filters);
  effective.citySlug = "frisco";
  assert.equal(effective.pool, true, "feature predicate survives tampering");
  assert.equal(effective.citySlug, "frisco", "canonical city survives tampering");
  assert.equal(effective.minBeds, 1, "harmless extra filters still stack");
});

test("the feature premise is a FLOOR: stricter user filters still narrow", () => {
  // acreage: a user asking for 50+ acres must not be clamped back to 1
  const strict = { minAcres: 50 };
  applyFeaturePremise(strict, FEATURES["on-acreage"].filters);
  assert.equal(strict.minAcres, 50);
  assert.equal(strict.residentialOnly, true);
  // and a looser/missing value snaps UP to the premise
  const loose = { minAcres: 0.25 };
  applyFeaturePremise(loose, FEATURES["on-acreage"].filters);
  assert.equal(loose.minAcres, 1);
  const beds = { minBeds: 6 };
  applyFeaturePremise(beds, FEATURES["5-plus-bedrooms"].filters);
  assert.equal(beds.minBeds, 6, "6+ beds on the 5+ page stays 6+");
  const bedsLoose = { minBeds: 2 };
  applyFeaturePremise(bedsLoose, FEATURES["5-plus-bedrooms"].filters);
  assert.equal(bedsLoose.minBeds, 5);
});

test("open-house indexing keeps only future, non-canceled events (soonest per listing)", () => {
  const now = Date.parse("2026-07-24T12:00:00-05:00");
  const rows = [
    { ListingKey: "A", OpenHouseDate: "2026-07-25", OpenHouseStartTime: "2026-07-25T14:00:00-05:00", OpenHouseEndTime: "2026-07-25T16:00:00-05:00", OpenHouseStatus: "Active" },
    { ListingKey: "A", OpenHouseDate: "2026-08-01", OpenHouseStartTime: "2026-08-01T14:00:00-05:00", OpenHouseEndTime: "2026-08-01T16:00:00-05:00", OpenHouseStatus: "Active" },
    { ListingKey: "B", OpenHouseDate: "2026-07-01", OpenHouseStartTime: "2026-07-01T14:00:00-05:00", OpenHouseEndTime: "2026-07-01T16:00:00-05:00", OpenHouseStatus: "Active" }, // past
    { ListingKey: "C", OpenHouseDate: "2026-07-26", OpenHouseStartTime: "2026-07-26T14:00:00-05:00", OpenHouseEndTime: "2026-07-26T16:00:00-05:00", OpenHouseStatus: "Canceled" },
    { ListingKey: "D", OpenHouseDate: "2026-07-26", OpenHouseStartTime: null, OpenHouseEndTime: "2026-07-26T16:00:00-05:00", OpenHouseStatus: "Active" }, // malformed
  ];
  const idx = indexOpenHouseEvents(rows, now);
  assert.deepEqual(idx.keys.sort(), ["A"]);
  assert.equal(idx.nextByKey["A"].date, "2026-07-25", "soonest event wins");
  assert.match(idx.nextByKey["A"].window, /2.*4.*PM/);
});

test("registry is explicit, valid, and inside the launch envelope", () => {
  const dataset = JSON.parse(readFileSync("lib/dfw.data.json", "utf8"));
  const slugs = new Set(dataset.cities.map((c) => c.slug));
  assert.ok(CITY_FEATURE_REGISTRY.length >= 24 && CITY_FEATURE_REGISTRY.length <= 36,
    `registry size ${CITY_FEATURE_REGISTRY.length} outside 24-36`);
  const seen = new Set();
  for (const e of CITY_FEATURE_REGISTRY) {
    assert.ok(isFeatureSlug(e.feature), `unknown feature ${e.feature}`);
    assert.ok(slugs.has(e.city), `unknown city slug ${e.city}`);
    const k = `${e.feature}:${e.city}`;
    assert.ok(!seen.has(k), `duplicate registry row ${k}`);
    seen.add(k);
  }
  // the marquee examples from the launch brief are all published
  assert.ok(cityFeaturePublished("with-pool", "frisco"));
  assert.ok(cityFeaturePublished("on-acreage", "argyle"));
  assert.ok(cityFeaturePublished("3-car-garage", "northlake"));
});

test("sitemap carries the hub, six metro pages, and ONLY registry city pages", () => {
  const paths = featureSitemapPaths();
  assert.ok(paths.includes("/homes/features"));
  for (const f of FEATURE_SLUGS) assert.ok(paths.includes(`/homes/${f}`));
  assert.equal(paths.length, 1 + 6 + CITY_FEATURE_REGISTRY.length, "nothing extra sneaks in");
  // spot-check: a valid but unpublished combination is NOT in the sitemap
  assert.ok(!paths.includes("/homes/with-pool/southlake"));
  assert.ok(!cityFeaturePublished("with-pool", "southlake"));
});

test("arbitrary combinations are noindex; registry and metro pages index", () => {
  assert.equal(featureIndexable("with-pool"), true);
  assert.equal(featureIndexable("with-pool", "frisco"), true);
  assert.equal(featureIndexable("with-pool", "sanger"), false, "off-registry city stays noindex");
  assert.equal(featureIndexable("with-pool", "not-a-city"), false);
  assert.equal(featureIndexable("with-jacuzzi"), false, "unknown feature is never indexable");
});

test("city links helpers respect the registry and the 4-link cap", () => {
  assert.ok(publishedCitiesFor("with-pool").includes("frisco"));
  const frisco = publishedFeaturesForCity("frisco");
  assert.ok(frisco.length <= 4, "city pages show at most four feature links");
  assert.ok(frisco.every((f) => cityFeaturePublished(f, "frisco")));
  assert.equal(publishedFeaturesForCity("sanger").length, 0);
});

test("feature paths are the stable route hierarchy", () => {
  assert.equal(featurePath("with-pool"), "/homes/with-pool");
  assert.equal(featurePath("with-pool", "frisco"), "/homes/with-pool/frisco");
});

test("titles and H1s are unique across features and literal", () => {
  const titles = new Set(FEATURE_SLUGS.map((f) => FEATURES[f].title));
  const h1s = new Set(FEATURE_SLUGS.map((f) => FEATURES[f].h1));
  assert.equal(titles.size, 6);
  assert.equal(h1s.size, 6);
  assert.equal(FEATURES["with-pool"].h1, "DFW homes with pools");
  assert.equal(FEATURES["with-pool"].h1City("Frisco"), "Frisco homes with pools");
  // new public copy avoids em dashes
  for (const f of FEATURE_SLUGS) {
    const def = FEATURES[f];
    for (const s of [def.title, def.description, def.fieldNote, def.h1]) {
      assert.ok(!s.includes("—"), `em dash in ${f}: ${s.slice(0, 40)}`);
    }
  }
});
