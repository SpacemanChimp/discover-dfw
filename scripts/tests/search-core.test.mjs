/* Tests for the editorial→MLS school-name bridge (the trickiest pure logic
   in the search feature). url.ts (school city-scoping) and lib/search/suggest
   both pull modules the node runner can't resolve without extensions, so
   those are verified live in the browser instead. node --test + TS stripping. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { schoolMatchToken } from "../../lib/mls/school-fields.ts";

test("schoolMatchToken strips the level/type suffix to the distinctive core", () => {
  assert.equal(schoolMatchToken("Denton High School"), "Denton");
  assert.equal(schoolMatchToken("Denton H S"), "Denton");
  assert.equal(schoolMatchToken("Denton"), "Denton");
  assert.equal(schoolMatchToken("North Crowley High School"), "North Crowley");
  assert.equal(schoolMatchToken("Robert E Lee Elementary School"), "Robert E Lee");
  assert.equal(schoolMatchToken("Rodriguez Middle"), "Rodriguez");
});

test("distinct schools normalize to distinct tokens (ILIKE can't collide them)", () => {
  assert.notEqual(schoolMatchToken("Denton High School"), schoolMatchToken("Denton Guyer High School"));
  assert.equal(schoolMatchToken("Denton Guyer High School"), "Denton Guyer");
});

test("token is safe as an ILIKE needle (letters/numbers/spaces only)", () => {
  assert.match(schoolMatchToken("St. Mary's Catholic H.S."), /^[a-z0-9 ]*$/i);
});
