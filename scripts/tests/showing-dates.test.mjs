/* Showing-request date logic — the rules that both the sheet and the server
   route depend on. Pure (Intl/Date only), so node --test runs them directly.
   A fixed reference instant keeps the assertions deterministic. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chicagoTodayISO,
  addDaysISO,
  dayDiff,
  friendlyLabel,
  quickDates,
  validateRequestedDay,
  SHOWING_MAX_DAYS,
} from "../../lib/showing/dates.ts";

// 2026-07-17 09:00 UTC = 2026-07-17 04:00 America/Chicago (CDT) — a stable "now"
const NOW = new Date("2026-07-17T09:00:00Z");
const TODAY = "2026-07-17";

test("chicagoTodayISO anchors to America/Chicago, not the runner's TZ", () => {
  assert.equal(chicagoTodayISO(NOW), TODAY);
  // 03:00 UTC on the 18th is still the 17th in Chicago (22:00 CDT)
  assert.equal(chicagoTodayISO(new Date("2026-07-18T03:00:00Z")), "2026-07-17");
});

test("addDaysISO is DST-safe across a spring-forward boundary", () => {
  assert.equal(addDaysISO("2026-03-07", 3), "2026-03-10"); // spans the 2026 DST start
  assert.equal(addDaysISO("2026-07-17", 1), "2026-07-18");
  assert.equal(addDaysISO("2026-12-31", 1), "2027-01-01");
});

test("quickDates: three future days from tomorrow, none in the past", () => {
  const q = quickDates(NOW);
  assert.equal(q.length, 3);
  assert.deepEqual(q.map((d) => d.iso), ["2026-07-18", "2026-07-19", "2026-07-20"]);
  for (const d of q) assert.ok(dayDiff(d.iso, TODAY) >= 1);
});

test("friendly labels read like 'Tomorrow · Sat, Jul 18'", () => {
  const q = quickDates(NOW);
  // 2026-07-18 is a Saturday (the task's "Fri, Jul 18" was illustrative)
  assert.equal(q[0].label, "Tomorrow · Sat, Jul 18");
  assert.equal(q[1].label, "Sun, Jul 19");
  assert.equal(q[0].eyebrow, "TOMORROW");
  assert.equal(q[1].eyebrow, "SUN");
  assert.equal(q[0].dateLine, "JUL 18");
  // a non-adjacent date never gets the "Tomorrow" prefix
  assert.equal(friendlyLabel("2026-08-04", TODAY), "Tue, Aug 4");
});

test("validateRequestedDay accepts today..+60 and rejects everything else", () => {
  assert.deepEqual(validateRequestedDay("2026-07-18", TODAY), { ok: true });
  assert.deepEqual(validateRequestedDay(TODAY, TODAY), { ok: true }); // today is not "past"
  assert.deepEqual(validateRequestedDay(addDaysISO(TODAY, SHOWING_MAX_DAYS), TODAY), { ok: true }); // exactly 60
});

test("validateRequestedDay rejects past, out-of-range, and malformed (tamper-proof)", () => {
  assert.deepEqual(validateRequestedDay("2026-07-16", TODAY), { ok: false, reason: "past" });
  assert.deepEqual(validateRequestedDay(addDaysISO(TODAY, 61), TODAY), { ok: false, reason: "out-of-range" });
  assert.deepEqual(validateRequestedDay("2026-13-40", TODAY), { ok: false, reason: "malformed" });
  assert.deepEqual(validateRequestedDay("2026-02-30", TODAY), { ok: false, reason: "malformed" }); // impossible date
  assert.deepEqual(validateRequestedDay("07/18/2026", TODAY), { ok: false, reason: "malformed" });
  assert.deepEqual(validateRequestedDay("", TODAY), { ok: false, reason: "malformed" });
});
