/* CB-2 exporter splice contract — fixture tests over the PURE helpers.
   Covers both dataset serializations the file has historically used:
   legacy compact arrays and the pretty JSON.stringify(·, null, 1) form the
   verified-data refresh (e56b6b3) moved the file to. The fail-closed
   guarantee is the point: any segment the exporter cannot reproduce
   byte-for-byte refuses to splice, and post-splice verification proves
   every pre-existing entry unchanged.
     node --test scripts/tests/export-splice.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { spliceNewBuilds, spliceCityHoods, verifySplicedOutput } from "../../scripts/content/export-community-drafts.mjs";

const DOC = {
  bounds: { lonMin: -98 },
  cities: [
    { slug: "midlothian", name: "Midlothian", hoods: [["MidTowne", "note a"], ["Valley Ridge", "note b"]] },
    { slug: "sanger", name: "Sanger", hoods: [["Downtown Sanger", "note c"]] },
  ],
  newBuilds: [
    { name: "MidTowne", city: "midlothian", from: "$400s", builders: 4, status: "NOW SELLING", note: "existing" },
  ],
};

const ENTRY = { name: "Bridgewater", city: "midlothian", from: "$430s", builders: 3, status: "NOW SELLING", note: "added" };

test("compact-form dataset: splice appends and preserves every other byte", () => {
  const raw = JSON.stringify(DOC);
  const out = spliceNewBuilds(raw, DOC, [ENTRY]);
  const parsed = JSON.parse(out);
  assert.equal(parsed.newBuilds.length, 2);
  assert.deepEqual(parsed.newBuilds[1], ENTRY);
  verifySplicedOutput(DOC, out, [ENTRY], new Map());
  // everything before the newBuilds value is byte-identical
  assert.equal(out.slice(0, raw.indexOf('"newBuilds":')), raw.slice(0, raw.indexOf('"newBuilds":')));
});

test("pretty-form dataset (null,1 — the post-e56b6b3 file): splice preserves style and bytes", () => {
  const raw = JSON.stringify(DOC, null, 1);
  const out = spliceNewBuilds(raw, DOC, [ENTRY]);
  const parsed = JSON.parse(out);
  assert.deepEqual(parsed.newBuilds[1], ENTRY);
  verifySplicedOutput(DOC, out, [ENTRY], new Map());
  // the spliced file still round-trips to the identical pretty serialization
  assert.equal(out, JSON.stringify(parsed, null, 1));
  // hoods splice on the pretty form too
  const doc2 = JSON.parse(out);
  const out2 = spliceCityHoods(out, doc2, "sanger", [["New Hood", "note d"]]);
  const parsed2 = JSON.parse(out2);
  assert.deepEqual(parsed2.cities[1].hoods.at(-1), ["New Hood", "note d"]);
  assert.equal(out2, JSON.stringify(parsed2, null, 1));
});

test("any unreproducible serialization still refuses fail-closed", () => {
  // 2-space indent is neither compact nor the (null,1) convention
  const raw = JSON.stringify(DOC, null, 2);
  assert.throws(() => spliceNewBuilds(raw, DOC, [ENTRY]), /does not match the parsed array byte-for-byte/);
  // hand-mangled whitespace inside the pretty segment also refuses
  const pretty = JSON.stringify(DOC, null, 1).replace('"builders": 4', '"builders":  4');
  assert.throws(() => spliceNewBuilds(pretty, JSON.parse(pretty), [ENTRY]), /does not match the parsed array byte-for-byte/);
});

test("verifySplicedOutput refuses when pre-existing entries change", () => {
  const raw = JSON.stringify(DOC, null, 1);
  const out = spliceNewBuilds(raw, DOC, [ENTRY]);
  const tampered = out.replace('"from": "$400s"', '"from": "$999s"');
  assert.throws(() => verifySplicedOutput(DOC, tampered, [ENTRY], new Map()), /pre-existing data changed|additions do not match/);
});
