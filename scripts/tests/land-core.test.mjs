/* Land-search domain logic — the rules the /land product depends on. Pure, so
   node --test runs them directly. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAND_CATEGORIES,
  subtypesForCategory,
  landSubtypeLabel,
  categoryForSubtype,
  isLandCategory,
  acresAreUsable,
  pricePerAcre,
  formatAcres,
  formatPricePerAcre,
} from "../../lib/land/land.ts";

test("categories map to the exact RESO subtypes observed in the feed", () => {
  assert.deepEqual(subtypesForCategory("unimproved"), ["UnimprovedLand"]);
  assert.deepEqual(subtypesForCategory("improved"), ["ImprovedLand"]);
  assert.deepEqual(subtypesForCategory("ranch"), ["Ranch"]);
  assert.deepEqual(subtypesForCategory("commercial"), ["Retail", "Warehouse"]);
  assert.equal(LAND_CATEGORIES.length, 4);
  assert.ok(isLandCategory("ranch"));
  assert.ok(!isLandCategory("bedrooms"));
});

test("subtype ↔ category round-trips; labels never say '0 beds'", () => {
  assert.equal(categoryForSubtype("Ranch"), "ranch");
  assert.equal(categoryForSubtype("Retail"), "commercial");
  assert.equal(categoryForSubtype("SingleFamilyResidence"), null); // a house is NOT land
  assert.equal(landSubtypeLabel("UnimprovedLand"), "Unimproved land");
  assert.equal(landSubtypeLabel("Warehouse"), "Commercial land");
  assert.equal(landSubtypeLabel(null), "Land");
});

test("price-per-acre never divides by zero and omits on bad inputs", () => {
  assert.equal(pricePerAcre(500000, 10), 50000);
  assert.equal(pricePerAcre(500000, 0), null); // divide-by-zero guard
  assert.equal(pricePerAcre(500000, null), null);
  assert.equal(pricePerAcre(0, 10), null);
  assert.equal(pricePerAcre(500000, -3), null);
  assert.equal(pricePerAcre(500000, 9_999_999), null); // implausible acreage
  assert.equal(pricePerAcre(340000, 340), 1000);
});

test("acreage usability + formatting", () => {
  assert.ok(acresAreUsable(0.34));
  assert.ok(!acresAreUsable(0));
  assert.ok(!acresAreUsable(null));
  assert.equal(formatAcres(0.34), "0.34 ac");
  assert.equal(formatAcres(12), "12 ac");
  assert.equal(formatAcres(340), "340 ac");
  assert.equal(formatAcres(0), null);
  assert.equal(formatAcres(1200), "1,200 ac");
  assert.equal(formatPricePerAcre(221893), "$221,893/ac");
  assert.equal(formatPricePerAcre(null), null);
});
