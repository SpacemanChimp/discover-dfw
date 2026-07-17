/* Mocked integration tests for the Follow Up Boss adapter core.
   Runs with the built-in test runner and Node's TS type-stripping —
   no test framework, no HTTP, no credentials:

     npm test        (= node --test scripts/tests/)

   The FUB API is mocked at the injected-fetch seam, so these exercise the
   real payload mapping, tag taxonomy, consent derivation, retry policy,
   and redaction exactly as production runs them. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEventPayload,
  buildTags,
  classifyPage,
  deriveConsent,
  parseUtm,
  redactedLogLine,
  resolveSendMode,
  sendFubEvent,
} from "../../lib/crm/fub-core.ts";

const NEW_BUILDS = new Set(["wildcat-ranch", "pecan-square"]);

/** A fully-populated showing request, as the route normalizes it. */
const showingLead = {
  kind: "showing_request",
  name: "Pat Example",
  email: "pat@example.com",
  phone: "555-0100",
  message: "Can we see it Saturday morning?",
  listingKey: "21334455",
  address: "123 Bluestem Dr, Celina",
  citySlug: "celina",
  cityName: "Celina",
  sourcePage: "/listing/21334455?utm_source=google&utm_medium=cpc&utm_campaign=spring-newbuilds",
  referrer: "https://www.google.com/",
  sessionId: "sid-1",
  userId: null,
  submittedAt: "2026-07-15T12:00:00.000Z",
  requestedDay: "2026-07-18",
  timeWindow: "Morning",
  tourMode: "in_person",
  timezone: "America/Chicago",
  dateSource: "calendar",
};

const questionLead = {
  kind: "listing_question",
  name: "Sam Example",
  email: "sam@example.com",
  phone: "555-0101",
  message: "Is the fence new?",
  listingKey: "99887766",
  address: "9 Oak St, Anna",
  citySlug: "anna",
  cityName: "Anna",
  sourcePage: "/city/anna/homes",
  referrer: null,
  sessionId: null,
  submittedAt: "2026-07-15T12:00:00.000Z",
  replyPref: "text",
};

const signupLead = {
  kind: "account_signup",
  name: null,
  email: "new@example.com",
  phone: null,
  message: null,
  listingKey: null,
  address: null,
  citySlug: null,
  sourcePage: "/city/crandall/wildcat-ranch",
  referrer: "https://duckduckgo.com/",
  sessionId: "sid-2",
  submittedAt: "2026-07-15T12:00:00.000Z",
};

/* ---------------- classification ---------------- */

test("classifyPage maps every DiscoverDFW surface", () => {
  assert.deepEqual(classifyPage("/", NEW_BUILDS), { pageType: "homepage", citySlug: null, hoodSlug: null });
  assert.deepEqual(classifyPage("/homes?city=anna", NEW_BUILDS), { pageType: "homes", citySlug: null, hoodSlug: null });
  assert.equal(classifyPage("/city/frisco", NEW_BUILDS).pageType, "city");
  assert.deepEqual(classifyPage("/city/frisco/homes", NEW_BUILDS), { pageType: "homes", citySlug: "frisco", hoodSlug: null });
  assert.deepEqual(classifyPage("/city/addison/les-lacs", NEW_BUILDS), {
    pageType: "neighborhood",
    citySlug: "addison",
    hoodSlug: "les-lacs",
  });
  assert.equal(classifyPage("/city/crandall/wildcat-ranch", NEW_BUILDS).pageType, "new-build");
  assert.equal(classifyPage("/listing/123?x=1", NEW_BUILDS).pageType, "listing");
  assert.equal(classifyPage(null, NEW_BUILDS).pageType, "other");
});

/* ---------------- UTM ---------------- */

test("parseUtm extracts campaign attribution and requires utm_source", () => {
  assert.deepEqual(parseUtm(showingLead.sourcePage), {
    source: "google",
    medium: "cpc",
    campaign: "spring-newbuilds",
  });
  assert.equal(parseUtm("/city/anna/homes"), null);
  assert.equal(parseUtm("/homes?utm_medium=cpc"), null); // no utm_source → no campaign object
});

/* ---------------- consent ---------------- */

test("consent is transactional at most, SMS only on explicit text preference", () => {
  assert.deepEqual(deriveConsent(showingLead), { email: "transactional", sms: "none" });
  assert.deepEqual(deriveConsent(questionLead), { email: "transactional", sms: "transactional" });
  assert.deepEqual(deriveConsent({ ...signupLead, email: null }), { email: "none", sms: "none" });
});

/* ---------------- tags ---------------- */

test("tags carry page type, city, community, offer, and consent", () => {
  const page = classifyPage(signupLead.sourcePage, NEW_BUILDS);
  const tags = buildTags(signupLead, page);
  assert.deepEqual(tags, [
    "ddfw:lead",
    "offer:account-signup",
    "ddfw:new-build",
    "city:crandall",
    "community:wildcat-ranch",
    "ddfw:email-consent:transactional",
    "ddfw:sms-consent:none",
  ]);
});

/* ---------------- payload mapping ---------------- */

test("showing request maps to a Property Inquiry with every required context", () => {
  const p = buildEventPayload(showingLead, {
    source: "DiscoverDFW",
    system: "DiscoverDFW",
    siteUrl: "https://www.discoverdfw.com",
    newBuildSlugs: NEW_BUILDS,
  });
  assert.equal(p.source, "DiscoverDFW");
  assert.equal(p.system, "DiscoverDFW");
  assert.equal(p.type, "Property Inquiry");
  assert.equal(p.message, showingLead.message);
  assert.equal(p.occurredAt, showingLead.submittedAt); // submission date
  assert.equal(p.pageUrl, "https://www.discoverdfw.com" + showingLead.sourcePage); // original page URL
  assert.equal(p.pageReferrer, "https://www.google.com/"); // referrer
  assert.deepEqual(p.campaign, { source: "google", medium: "cpc", campaign: "spring-newbuilds" }); // UTM
  assert.deepEqual(p.person.emails, [{ value: "pat@example.com" }]);
  assert.deepEqual(p.person.phones, [{ value: "555-0100" }]);
  assert.equal(p.person.name, "Pat Example");
  assert.deepEqual(p.property, {
    mlsNumber: "21334455", // MLS number
    street: "123 Bluestem Dr, Celina",
    city: "Celina",
    state: "TX",
  });
  assert.ok(p.person.tags.includes("ddfw:listing"));
  assert.ok(p.person.tags.includes("city:celina"));
  assert.ok(p.person.tags.includes("offer:showing-request"));
  // readable summary preserves the ask
  assert.match(p.description, /Showing request via DiscoverDFW/);
  assert.match(p.description, /Requested: 2026-07-18, Morning, in person \(a request — time to be confirmed\)/);
  assert.match(p.description, /Buyer timezone: America\/Chicago/);
  assert.match(p.description, /Date chosen via: calendar picker/);
  assert.match(p.description, /City: Celina/);
  assert.match(p.description, /Consent: email transactional, SMS none/);
  assert.match(p.description, /Submitted: 2026-07-15/);
  // routing/ownership stays with FUB rules — we never assign or stage
  assert.ok(!("assignedTo" in p) && !("assignedUserId" in p) && !("stage" in p.person));
});

test("account signup maps to Registration without property", () => {
  const p = buildEventPayload(signupLead, { source: "DiscoverDFW", newBuildSlugs: NEW_BUILDS });
  assert.equal(p.type, "Registration");
  assert.equal(p.property, undefined);
  assert.equal(p.message, undefined);
  assert.match(p.description, /Community: wildcat-ranch/);
});

/* ---------------- send-mode gating ---------------- */

test("resolveSendMode mirrors the project's dry-run tiers", () => {
  assert.equal(resolveSendMode({}), "disabled");
  assert.equal(resolveSendMode({ FUB_API_KEY: "k", NODE_ENV: "development" }), "dry-run");
  assert.equal(resolveSendMode({ FUB_API_KEY: "k", NODE_ENV: "development", FUB_SEND_IN_DEV: "1" }), "live");
  assert.equal(resolveSendMode({ FUB_API_KEY: "k", NODE_ENV: "production" }), "live");
  // kill switch wins everywhere
  assert.equal(resolveSendMode({ FUB_API_KEY: "k", NODE_ENV: "production", FUB_DRY_RUN: "1" }), "dry-run");
});

/* ---------------- HTTP send + retry (mocked FUB) ---------------- */

const CFG = { apiKey: "test-key", system: "DiscoverDFW", systemKey: "sys-key" };
function makeDeps(responses) {
  const calls = [];
  const sleeps = [];
  let i = 0;
  return {
    calls,
    sleeps,
    deps: {
      fetch: async (url, init) => {
        calls.push({ url, init });
        const r = responses[Math.min(i++, responses.length - 1)];
        if (r instanceof Error) throw r;
        return r;
      },
      sleep: async (ms) => void sleeps.push(ms),
    },
  };
}
const json = (status, body) => new Response(JSON.stringify(body), { status });

test("201 created — correct endpoint, auth, and system headers", async () => {
  const { calls, deps } = makeDeps([json(201, { id: 42 })]);
  const payload = buildEventPayload(questionLead, { source: "DiscoverDFW", newBuildSlugs: NEW_BUILDS });
  const res = await sendFubEvent(payload, CFG, deps);
  assert.deepEqual(res, { ok: true, status: 201, attempts: 1, personId: 42 });
  assert.equal(calls[0].url, "https://api.followupboss.com/v1/events");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Basic " + Buffer.from("test-key:").toString("base64"));
  assert.equal(calls[0].init.headers["X-System"], "DiscoverDFW");
  assert.equal(calls[0].init.headers["X-System-Key"], "sys-key");
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.person.emails[0].value, "sam@example.com");
});

test("200 — existing contact updated, event appended (FUB dedupe by email/phone)", async () => {
  const { deps } = makeDeps([json(200, { id: 7 })]);
  const res = await sendFubEvent({ source: "s", type: "Property Inquiry", description: "d", occurredAt: "t", person: { tags: [] } }, CFG, deps);
  assert.deepEqual(res, { ok: true, status: 200, attempts: 1, personId: 7 });
});

test("204 — archived lead flow is accepted, flagged ignored", async () => {
  const { deps } = makeDeps([new Response(null, { status: 204 })]);
  const res = await sendFubEvent({ source: "s", type: "Registration", description: "d", occurredAt: "t", person: { tags: [] } }, CFG, deps);
  assert.equal(res.ok, true);
  assert.equal(res.ignored, true);
});

test("network error retries with backoff, then succeeds — no duplicate contact risk", async () => {
  const { deps, sleeps } = makeDeps([new Error("ECONNRESET"), json(201, { id: 1 })]);
  const res = await sendFubEvent({ source: "s", type: "Registration", description: "d", occurredAt: "t", person: { tags: [] } }, CFG, deps);
  assert.equal(res.ok, true);
  assert.equal(res.attempts, 2);
  assert.deepEqual(sleeps, [500]);
});

test("429 honors Retry-After and retries (docs: request was NOT processed)", async () => {
  const { deps, sleeps } = makeDeps([
    new Response(null, { status: 429, headers: { "retry-after": "2" } }),
    json(200, { id: 3 }),
  ]);
  const res = await sendFubEvent({ source: "s", type: "Registration", description: "d", occurredAt: "t", person: { tags: [] } }, CFG, deps);
  assert.equal(res.ok, true);
  assert.equal(res.attempts, 2);
  assert.deepEqual(sleeps, [2000]);
});

test("400 fails immediately — validation errors are never retried", async () => {
  const { calls, deps } = makeDeps([new Response("Invalid person", { status: 400 })]);
  const res = await sendFubEvent({ source: "s", type: "Registration", description: "d", occurredAt: "t", person: { tags: [] } }, CFG, deps);
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
  assert.equal(res.attempts, 1);
  assert.equal(calls.length, 1);
});

test("persistent 503 exhausts retries and reports failure", async () => {
  const { calls, deps } = makeDeps([new Response(null, { status: 503 })]);
  const res = await sendFubEvent({ source: "s", type: "Registration", description: "d", occurredAt: "t", person: { tags: [] } }, CFG, deps);
  assert.equal(res.ok, false);
  assert.equal(res.status, 503);
  assert.equal(res.attempts, 3);
  assert.equal(calls.length, 3);
});

/* ---------------- log redaction ---------------- */

test("production log lines never contain contact details", () => {
  const line = redactedLogLine(showingLead, { ok: true, status: 201, attempts: 1, personId: 42 }, "live");
  assert.ok(!line.includes("Pat"), "name leaked");
  assert.ok(!line.includes("pat@example.com"), "email leaked");
  assert.ok(!line.includes("555-0100"), "phone leaked");
  assert.ok(!line.includes("Saturday"), "message leaked");
  assert.match(line, /kind=showing_request/);
  assert.match(line, /status=201/);
  assert.match(line, /listing=21334455/);
});
