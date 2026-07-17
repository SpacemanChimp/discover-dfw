/* Tests for the conversion-panel core (lib/convert/intents) and its ride
   through the normalized lead model (lib/crm/fub-core). Runs with the
   built-in runner + TS type-stripping: npm test */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INTENTS,
  INTENT_KEYS,
  buildLeadBody,
  classifyContact,
  validateStep1,
} from "../../lib/convert/intents.ts";
import { buildEventPayload } from "../../lib/crm/fub-core.ts";

const SPEC_COPY = {
  "build-my-shortlist": "Tell us your budget, commute, and priorities. We'll narrow North Texas to a practical shortlist.",
  "curated-homes": "Want a cleaner list than the entire market? Get homes selected around your budget, location, and must-haves.",
  "new-build-incentives": "Get the currently verified builder, inventory, and incentive information before visiting the models.",
  "plan-builder-tour": "Plan one efficient route through the builders and communities that fit your budget.",
  "homeowner-equity-plan": "Already own here? See what your equity and timing could make possible elsewhere.",
  "human-search-help": "Too many results? Tell us what matters and we'll help narrow the map.",
};

test("all seven intents exist with complete, spec-matching config", () => {
  assert.equal(INTENT_KEYS.length, 7);
  for (const key of INTENT_KEYS) {
    const cfg = INTENTS[key];
    for (const f of ["kicker", "headline", "body", "cta", "primaryLabel", "primaryHint", "success"]) {
      assert.ok(cfg[f] && cfg[f].length > 4, `${key}.${f} populated`);
    }
    assert.ok(Object.keys(cfg.step2).length >= 1, `${key} has an optional step`);
  }
  for (const [key, copy] of Object.entries(SPEC_COPY)) {
    assert.equal(INTENTS[key].body, copy, `${key} uses the specified copy`);
  }
  assert.ok(INTENTS["compare-this-city"].step2.compareCity, "compare variant collects the compared city");
  assert.ok(!INTENTS["homeowner-equity-plan"].step2.budget, "equity variant doesn't ask for budget (unnecessary)");
});

test("contact classification: email vs mobile vs junk", () => {
  assert.deepEqual(classifyContact("Pat@Example.com"), { email: "pat@example.com" });
  assert.deepEqual(classifyContact("(214) 555-0100"), { phone: "(214) 555-0100" });
  assert.deepEqual(classifyContact("+1 214 555 0100"), { phone: "+1 214 555 0100" });
  assert.equal(classifyContact("hello"), null);
  assert.equal(classifyContact("555-0100"), null); // too short
  assert.equal(classifyContact(""), null);
});

test("step-1 validation requires name, valid contact, and a primary request", () => {
  const errs = validateStep1({ name: " ", contact: "nope", primary: "" });
  assert.ok(errs.name && errs.contact && errs.primary);
  assert.deepEqual(validateStep1({ name: "Pat", contact: "pat@example.com", primary: "under $500K" }), {});
});

test("lead body preserves page context, UTM source page, and collects nothing extra", () => {
  const body = buildLeadBody(
    "compare-this-city",
    { name: " Pat ", contact: " pat@example.com ", primary: "here vs Prosper" },
    { compareCity: "Prosper", budget: "$550K", message: "" },
    {
      sourcePage: "/city/celina?utm_source=google&utm_medium=cpc",
      referrer: "https://www.google.com/",
      sessionId: "sid-9",
      citySlug: "celina",
      community: null,
    },
    { hp: "", openedAt: 1234 }
  );
  assert.equal(body.type, "guide");
  assert.equal(body.intent, "compare-this-city");
  assert.equal(body.name, "Pat");
  assert.equal(body.sourcePage, "/city/celina?utm_source=google&utm_medium=cpc"); // UTM survives
  assert.equal(body.referrer, "https://www.google.com/");
  assert.equal(body.citySlug, "celina");
  assert.equal(body.comparingWith, "Prosper");
  assert.equal(body.message, undefined); // empty optional fields are dropped
  const allowed = new Set([
    "type", "intent", "name", "contact", "primary", "budget", "timeline", "comparingWith",
    "message", "citySlug", "community", "sourcePage", "referrer", "sessionId", "hp", "openedAt",
  ]);
  for (const k of Object.keys(body)) assert.ok(allowed.has(k), `unexpected field ${k}`);
});

test("guide_request rides the normalized model into FUB with intent tags", () => {
  const payload = buildEventPayload(
    {
      kind: "guide_request",
      intent: "build-my-shortlist",
      name: "Pat Example",
      email: "pat@example.com",
      phone: null,
      message: "under $550K, 30 min to DFW",
      listingKey: null,
      address: null,
      citySlug: "celina",
      cityName: "Celina",
      sourcePage: "/city/celina?utm_source=google",
      referrer: "https://www.google.com/",
      sessionId: "sid-9",
      submittedAt: "2026-07-16T12:00:00.000Z",
      budget: "$550K",
      timeline: "3–6 months",
      comparingWith: "Prosper",
    },
    { source: "DiscoverDFW", siteUrl: "https://www.discoverdfw.com", newBuildSlugs: new Set() }
  );
  assert.equal(payload.type, "General Inquiry");
  assert.ok(payload.person.tags.includes("offer:build-my-shortlist"), "intent is the offer tag");
  assert.ok(payload.person.tags.includes("city:celina"));
  assert.match(payload.description, /Guide request \(build-my-shortlist\)/);
  assert.match(payload.description, /Budget: \$550K/);
  assert.match(payload.description, /Timeline: 3–6 months/);
  assert.match(payload.description, /Comparing with: Prosper/);
  assert.deepEqual(payload.campaign, { source: "google" }); // UTM attribution preserved
  // mobile-only contact ⇒ text consent; email-only ⇒ none
  assert.ok(payload.person.tags.includes("ddfw:sms-consent:none"));
});

test("listing leads tag the MLS community even when the URL doesn't carry it", () => {
  const payload = buildEventPayload(
    {
      kind: "showing_request",
      name: "Pat Example",
      email: "pat@example.com",
      phone: null,
      message: null,
      listingKey: "1177002678",
      address: "12464 Lost Valley Drive",
      citySlug: "frisco",
      cityName: "Frisco",
      community: "Panther Creek Ph 1 & 2",
      sourcePage: "/listing/1177002678",
      referrer: null,
      sessionId: null,
      submittedAt: "2026-07-16T12:00:00.000Z",
      requestedDay: "2026-07-18",
      timeWindow: "Morning",
      tourMode: "in_person",
    },
    { source: "DiscoverDFW", newBuildSlugs: new Set() }
  );
  assert.ok(payload.person.tags.includes("community:panther-creek-ph-1-and-2"), "MLS subdivision slugified into a tag");
  assert.match(payload.description, /Neighborhood: Panther Creek Ph 1 & 2/);
  assert.ok(payload.person.tags.includes("ddfw:listing"));
});
