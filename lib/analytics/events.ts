/* First-party conversion analytics — the PURE event contract (no React, no
   server imports, no database). Everything the /api/events endpoint will
   store is validated HERE against a closed world: 12 allowlisted event
   names, shape-checked context fields, query-stripped paths, and PII
   refusal (email- and phone-shaped values never pass). There is no
   free-form metadata field by design. Tested by
   scripts/tests/analytics-core.test.mjs. */

export const EVENT_NAMES = [
  "search_started",
  "search_results_viewed",
  "search_view_changed",
  "listing_viewed",
  "phone_clicked",
  "cta_clicked",
  "lead_form_started",
  "lead_submitted",
  "showing_requested",
  "saved_search_created",
  "letter_signup_started",
  "letter_subscribed",
  // remediation additions (migration 0024 widens the DB allowlist; until
  // it is applied the server refuses these quietly — nothing breaks)
  "city_guide_view",
  "save_home_click",
  "signup_modal_open",
  "signup_complete",
  "newsletter_view",
  "newsletter_error",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];
const EVENT_SET = new Set<string>(EVENT_NAMES);

export const PAGE_TYPES = ["home", "search", "listing", "city", "community", "letter", "research", "other"] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export const SEARCH_SCOPES = ["homes", "land", "new-builds", "city-homes"] as const;
export const SEARCH_VIEWS = ["map", "list", "split"] as const;

/** filter CATEGORIES only — never filter values (a price band or a school
    name is someone's life circumstance; which knobs were touched is not) */
export const FILTER_CATEGORIES = [
  "price", "beds", "baths", "sqft", "lot", "year", "type", "schools", "city", "new-build", "status", "keywords",
] as const;
const FILTER_SET = new Set<string>(FILTER_CATEGORIES);

/** intents an event may carry: the existing lead intents plus the three
    non-sheet conversions */
export const EVENT_INTENTS = [
  "build-my-shortlist", "compare-this-city", "curated-homes", "new-build-incentives",
  "plan-builder-tour", "homeowner-equity-plan", "human-search-help", "ask-a-question",
  "build-land-shortlist", "schedule-showing", "save-search", "newsletter",
  // signup-modal triggers (which action opened the account modal — a
  // category, never a value)
  "save-home", "header-signin", "account-cta",
] as const;
const INTENT_SET = new Set<string>(EVENT_INTENTS);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** the shared lib/session-id.ts identity (a uuid) — one session across
    lead_events and site_events so funnels join to leads */
const SESSION_RE = /^[A-Za-z0-9-]{16,36}$/;
const SLUG_RE = /^[a-z0-9-]{2,60}$/;
const LISTING_RE = /^[A-Za-z0-9_-]{4,40}$/;

/* ---------------------------------------------------------------- PII */

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** 7+ digits in a row (allowing common separators) reads as a phone number */
const PHONE_RE = /(?:\d[\s().+-]?){7,}/;

export function looksLikePii(v: string): boolean {
  return EMAIL_RE.test(v) || PHONE_RE.test(v);
}

/** short free-ish text (utm fields): control chars stripped, PII refused —
    a PII-shaped value drops the FIELD, never the event */
function cleanShort(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f<>"']/g, "").trim().slice(0, max);
  if (!s || looksLikePii(s)) return null;
  return s;
}

/* ------------------------------------------------------------- fields */

/** stored paths carry NO query string and NO fragment — query strings are
    where PII (school searches, prefilled contact fields) travels */
export function cleanPath(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const noQuery = v.split(/[?#]/)[0].trim();
  if (!noQuery.startsWith("/") || noQuery.length > 200) return null;
  if (/[\s@<>"']/.test(noQuery)) return null;
  return noQuery;
}

/** page type is DERIVED from the stored path — never client-asserted */
export function pageTypeFor(path: string): PageType {
  if (path === "/") return "home";
  if (path === "/homes" || path === "/land" || path === "/new-builds") return "search";
  if (path.startsWith("/listing/")) return "listing";
  if (/^\/city\/[a-z0-9-]+\/homes$/.test(path)) return "search";
  if (/^\/city\/[a-z0-9-]+\/[a-z0-9-]+$/.test(path)) return "community";
  if (/^\/city\/[a-z0-9-]+$/.test(path)) return "city";
  if (path.startsWith("/letter")) return "letter";
  if (path === "/how-we-research") return "research";
  return "other";
}

export function cleanReferrerDomain(v: unknown, selfHost?: string): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    const host = new URL(v).hostname.toLowerCase().slice(0, 100);
    if (!host || (selfHost && (host === selfHost || host.endsWith(`.${selfHost}`)))) return null;
    return host;
  } catch {
    return null;
  }
}

export function cleanFilterCategories(v: unknown): string | null {
  if (!Array.isArray(v)) return null;
  const cats = [...new Set(v.filter((c) => typeof c === "string" && FILTER_SET.has(c)))].sort();
  return cats.length ? cats.join(",").slice(0, 160) : null;
}

/* ---------------------------------------------------------- the event */

export interface CleanEvent {
  event_id: string;
  event: EventName;
  session_id: string;
  path: string;
  page_type: PageType;
  city_slug: string | null;
  community_slug: string | null;
  listing_key: string | null;
  intent: string | null;
  scope: string | null;
  view: string | null;
  filter_categories: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer_domain: string | null;
  lead_id: string | null;
}

/** Validate one raw submission into a storable row, or refuse with a
    reason. Unknown keys are ignored entirely (no arbitrary metadata);
    invalid OPTIONAL fields drop to null; invalid REQUIRED fields refuse
    the event. */
export function cleanEvent(raw: unknown, opts?: { selfHost?: string }): { ok: true; row: CleanEvent } | { ok: false; reason: string } {
  const r = (raw ?? {}) as Record<string, unknown>;

  const event = typeof r.event === "string" && EVENT_SET.has(r.event) ? (r.event as EventName) : null;
  if (!event) return { ok: false, reason: "unknown event name" };

  const eventId = typeof r.eventId === "string" && UUID_RE.test(r.eventId) ? r.eventId.toLowerCase() : null;
  if (!eventId) return { ok: false, reason: "missing event id" };

  const sessionId = typeof r.sessionId === "string" && SESSION_RE.test(r.sessionId) ? r.sessionId : null;
  if (!sessionId) return { ok: false, reason: "missing session id" };

  const path = cleanPath(r.path);
  if (!path) return { ok: false, reason: "bad path" };
  if (path.startsWith("/admin") || path.startsWith("/api")) return { ok: false, reason: "admin/api paths are never tracked" };

  const slug = (v: unknown) => (typeof v === "string" && SLUG_RE.test(v) ? v : null);
  const intent = typeof r.intent === "string" && INTENT_SET.has(r.intent) ? r.intent : null;
  const scope = typeof r.scope === "string" && (SEARCH_SCOPES as readonly string[]).includes(r.scope) ? r.scope : null;
  const view = typeof r.view === "string" && (SEARCH_VIEWS as readonly string[]).includes(r.view) ? r.view : null;
  const leadId = typeof r.leadId === "string" && UUID_RE.test(r.leadId) ? r.leadId.toLowerCase() : null;

  return {
    ok: true,
    row: {
      event_id: eventId,
      event,
      session_id: sessionId,
      path,
      page_type: pageTypeFor(path),
      city_slug: slug(r.citySlug),
      community_slug: slug(r.communitySlug),
      listing_key: typeof r.listingKey === "string" && LISTING_RE.test(r.listingKey) ? r.listingKey : null,
      intent,
      scope,
      view,
      filter_categories: cleanFilterCategories(r.filterCategories),
      utm_source: cleanShort(r.utmSource, 80),
      utm_medium: cleanShort(r.utmMedium, 80),
      utm_campaign: cleanShort(r.utmCampaign, 80),
      utm_content: cleanShort(r.utmContent, 80),
      utm_term: cleanShort(r.utmTerm, 80),
      referrer_domain: cleanReferrerDomain(r.referrer, opts?.selfHost),
      lead_id: leadId,
    },
  };
}

/* --------------------------------------------------- funnel aggregation */

export const FUNNEL_STAGES: { event: EventName; label: string }[] = [
  { event: "search_started", label: "Search started" },
  { event: "search_results_viewed", label: "Search results viewed" },
  { event: "listing_viewed", label: "Listing viewed" },
  { event: "lead_form_started", label: "CTA / form started" },
  { event: "lead_submitted", label: "Lead submitted" },
  { event: "showing_requested", label: "Showing requested" },
  { event: "saved_search_created", label: "Saved search created" },
];

/** Pure funnel rollup over (event, count) pairs: absolute counts plus the
    percentage of the PREVIOUS stage each stage retains (first stage =
    100%; a later stage larger than its predecessor caps at 100). */
export function funnelFromCounts(counts: Partial<Record<EventName, number>>): { event: EventName; label: string; count: number; pctOfPrev: number | null }[] {
  const out: { event: EventName; label: string; count: number; pctOfPrev: number | null }[] = [];
  let prev: number | null = null;
  for (const s of FUNNEL_STAGES) {
    const count = Math.max(0, counts[s.event] ?? 0);
    const pctOfPrev = prev === null ? null : prev === 0 ? 0 : Math.min(100, Math.round((count / prev) * 1000) / 10);
    out.push({ event: s.event, label: s.label, count, pctOfPrev });
    prev = count;
  }
  return out;
}
