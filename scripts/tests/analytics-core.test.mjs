/* First-party analytics contract — the pure event allowlist, PII refusal,
   metadata sanitization, path stripping, and funnel aggregation.
     node --test scripts/tests/analytics-core.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { EVENT_NAMES, cleanEvent, cleanPath, pageTypeFor, cleanReferrerDomain, cleanFilterCategories, looksLikePii, funnelFromCounts } from "../../lib/analytics/events.ts";

const base = () => ({
  event: "listing_viewed",
  eventId: "5f1e7a34-9c1b-4b5e-8a3d-2f6c9d0e1a2b",
  sessionId: "abcd1234efgh5678",
  path: "/listing/ABC123",
});

test("only the 18 allowlisted event names pass; everything else refuses", () => {
  assert.equal(EVENT_NAMES.length, 18); // 12 launch names + 6 remediation names (0024)
  for (const name of ["city_guide_view", "save_home_click", "signup_modal_open", "signup_complete", "newsletter_view", "newsletter_error"]) {
    assert.ok(EVENT_NAMES.includes(name), `${name} is in the contract`);
  }
  for (const event of EVENT_NAMES) {
    const r = cleanEvent({ ...base(), event });
    assert.equal(r.ok, true, `${event} should pass`);
  }
  for (const bad of ["pageview", "click", "search", "", 42, null, "lead_submitted; drop table"]) {
    assert.equal(cleanEvent({ ...base(), event: bad }).ok, false, `${String(bad)} should refuse`);
  }
});

test("required identity fields refuse the event; optional fields fail soft to null", () => {
  assert.equal(cleanEvent({ ...base(), eventId: "not-a-uuid" }).ok, false);
  assert.equal(cleanEvent({ ...base(), sessionId: "short" }).ok, false);
  assert.equal(cleanEvent({ ...base(), path: "listing/no-slash" }).ok, false);
  const r = cleanEvent({ ...base(), citySlug: "NOT A SLUG!!", listingKey: "x", intent: "made-up-intent", scope: "everything", leadId: "nope" });
  assert.equal(r.ok, true);
  assert.equal(r.row.city_slug, null);
  assert.equal(r.row.listing_key, null);
  assert.equal(r.row.intent, null);
  assert.equal(r.row.scope, null);
  assert.equal(r.row.lead_id, null);
});

test("arbitrary client metadata is ignored — no unknown key survives", () => {
  const r = cleanEvent({ ...base(), email: "x@y.com", message: "call me", meta: { anything: true } });
  assert.equal(r.ok, true);
  assert.equal("email" in r.row, false);
  assert.equal("message" in r.row, false);
  assert.equal("meta" in r.row, false);
  // the row's key set is exactly the storable contract
  assert.equal(Object.keys(r.row).length, 19);
});

test("PII-shaped values are refused: emails and phone-length digit runs", () => {
  assert.equal(looksLikePii("jane@example.com"), true);
  assert.equal(looksLikePii("(214) 555-0100"), true);
  assert.equal(looksLikePii("214-555-0100"), true);
  assert.equal(looksLikePii("spring-sale"), false);
  assert.equal(looksLikePii("dfw2026"), false); // short digit runs are fine
  const r = cleanEvent({ ...base(), utmSource: "newsletter", utmCampaign: "reach me at 2145550100", utmTerm: "a@b.co" });
  assert.equal(r.ok, true);
  assert.equal(r.row.utm_source, "newsletter");
  assert.equal(r.row.utm_campaign, null); // PII-shaped field drops, event survives
  assert.equal(r.row.utm_term, null);
});

test("paths store query- and fragment-stripped; admin/api paths never track", () => {
  assert.equal(cleanPath("/homes?school=Guyer%20High&email=x@y.com#top"), "/homes");
  assert.equal(cleanPath("/city/frisco/homes?minPrice=400000"), "/city/frisco/homes");
  assert.equal(cleanPath("bad"), null);
  assert.equal(cleanEvent({ ...base(), path: "/admin/editor" }).ok, false);
  assert.equal(cleanEvent({ ...base(), path: "/api/leads" }).ok, false);
});

test("page type derives from the path, never from the client", () => {
  assert.equal(pageTypeFor("/"), "home");
  assert.equal(pageTypeFor("/homes"), "search");
  assert.equal(pageTypeFor("/land"), "search");
  assert.equal(pageTypeFor("/city/frisco/homes"), "search");
  assert.equal(pageTypeFor("/listing/ABC123"), "listing");
  assert.equal(pageTypeFor("/city/frisco"), "city");
  assert.equal(pageTypeFor("/city/midlothian/bridgewater"), "community");
  assert.equal(pageTypeFor("/how-we-research"), "research");
  assert.equal(pageTypeFor("/letter/unsubscribe"), "letter");
  assert.equal(pageTypeFor("/somewhere-else"), "other");
});

test("referrer stores the hostname only, dropping self-referrals", () => {
  assert.equal(cleanReferrerDomain("https://www.google.com/search?q=frisco+homes"), "www.google.com");
  assert.equal(cleanReferrerDomain("https://www.discoverdfw.com/homes", "discoverdfw.com"), null);
  assert.equal(cleanReferrerDomain("not a url"), null);
  assert.equal(cleanReferrerDomain(""), null);
});

test("filter categories: closed set, deduped, sorted — never values", () => {
  assert.equal(cleanFilterCategories(["price", "beds", "price", "schools"]), "beds,price,schools");
  assert.equal(cleanFilterCategories(["price", "school=Guyer High"]), "price");
  assert.equal(cleanFilterCategories(["nope"]), null);
  assert.equal(cleanFilterCategories("price"), null);
});

test("funnel aggregation: counts + stage-over-stage percentages, capped at 100", () => {
  const f = funnelFromCounts({ search_started: 200, search_results_viewed: 150, listing_viewed: 60, lead_form_started: 12, lead_submitted: 9, showing_requested: 3, saved_search_created: 5 });
  assert.equal(f[0].pctOfPrev, null);
  assert.equal(f[1].pctOfPrev, 75);
  assert.equal(f[2].pctOfPrev, 40);
  assert.equal(f[4].count, 9);
  assert.equal(f[4].pctOfPrev, 75);
  // an empty window renders zeros, not NaN
  const empty = funnelFromCounts({});
  assert.ok(empty.every((s) => s.count === 0));
  assert.ok(empty.slice(1).every((s) => s.pctOfPrev === 0));
  // a later stage larger than its predecessor caps at 100%
  const weird = funnelFromCounts({ search_started: 1, search_results_viewed: 50 });
  assert.equal(weird[1].pctOfPrev, 100);
});
