/* Follow Up Boss adapter — PURE CORE. No env reads, no app imports, no
   server-only: everything here is deterministic and unit-tested by
   scripts/tests/fub-core.test.mjs (node --test, TS type-stripping).
   The server binding (lib/crm/fub.ts) supplies env, fetch, and logging.

   Ingestion goes through POST /v1/events — per the FUB docs this is the
   only correct path for site leads: FUB deduplicates the CONTACT by
   email/phone, applies the account's lead-flow/routing rules, and applies
   `source` only to newly created contacts (an existing contact's original
   source attribution is never overwritten; our event still appends to the
   contact's timeline). We deliberately never send assignedTo/assignedUserId
   or stage, so account ownership/routing rules stay in charge. */

export type LeadKind = "showing_request" | "listing_question" | "account_signup" | "guide_request";

/** The normalized shape every DiscoverDFW intake route produces. */
export interface NormalizedLead {
  kind: LeadKind;
  name: string | null;
  email: string | null;
  phone: string | null;
  /** Free text the person actually wrote (question / showing note). */
  message: string | null;
  listingKey: string | null;
  address: string | null;
  citySlug: string | null;
  /** Resolved display name for citySlug (server binding fills this). */
  cityName?: string | null;
  /** Neighborhood/community context: MLS subdivision on listing leads,
      hood slug on guide leads. Tagged when the page URL doesn't carry it. */
  community?: string | null;
  /** Path + query as captured in the browser (may carry utm_*). */
  sourcePage: string | null;
  referrer: string | null;
  sessionId: string | null;
  userId?: string | null;
  /** ISO timestamp of the submission. */
  submittedAt: string;
  /* showing-request specifics */
  requestedDay?: string | null;
  timeWindow?: string | null;
  tourMode?: string | null;
  /* listing-question specifics */
  replyPref?: string | null; // "text" | "email"
  /* guide-request specifics (contextual conversion components) */
  intent?: string | null; // e.g. "build-my-shortlist" — becomes the offer tag
  comparingWith?: string | null;
  budget?: string | null;
  timeline?: string | null;
}

/* ---------------- page classification ---------------- */

export type PageType = "homepage" | "city" | "neighborhood" | "new-build" | "homes" | "listing" | "other";

export interface PageContext {
  pageType: PageType;
  citySlug: string | null;
  hoodSlug: string | null;
}

/** Classify a captured sourcePage path. newBuildSlugs decides whether a
    hood page is a new-build community report (injected — keeps this pure). */
export function classifyPage(sourcePage: string | null, newBuildSlugs: ReadonlySet<string>): PageContext {
  // no captured page → no page attribution (never guess "homepage")
  if (!sourcePage) return { pageType: "other", citySlug: null, hoodSlug: null };
  const path = sourcePage.split("?")[0].replace(/\/+$/, "") || "/";
  if (path === "/") return { pageType: "homepage", citySlug: null, hoodSlug: null };
  if (path === "/homes") return { pageType: "homes", citySlug: null, hoodSlug: null };
  if (path.startsWith("/listing/")) return { pageType: "listing", citySlug: null, hoodSlug: null };
  let m = path.match(/^\/city\/([^/]+)\/homes$/);
  if (m) return { pageType: "homes", citySlug: m[1], hoodSlug: null };
  m = path.match(/^\/city\/([^/]+)\/([^/]+)$/);
  if (m) {
    return {
      pageType: newBuildSlugs.has(m[2]) ? "new-build" : "neighborhood",
      citySlug: m[1],
      hoodSlug: m[2],
    };
  }
  m = path.match(/^\/city\/([^/]+)$/);
  if (m) return { pageType: "city", citySlug: m[1], hoodSlug: null };
  return { pageType: "other", citySlug: null, hoodSlug: null };
}

/* ---------------- UTM attribution ---------------- */

export interface FubCampaign {
  source?: string;
  medium?: string;
  term?: string;
  content?: string;
  campaign?: string;
}

/** utm_* params from the captured page URL → FUB campaign object
    (FUB requires campaign.source to accept the object at all). */
export function parseUtm(sourcePage: string | null): FubCampaign | null {
  const qs = (sourcePage || "").split("?")[1];
  if (!qs) return null;
  const params = new URLSearchParams(qs);
  const source = params.get("utm_source");
  if (!source) return null;
  const campaign: FubCampaign = { source };
  const medium = params.get("utm_medium");
  const term = params.get("utm_term");
  const content = params.get("utm_content");
  const name = params.get("utm_campaign");
  if (medium) campaign.medium = medium;
  if (term) campaign.term = term;
  if (content) campaign.content = content;
  if (name) campaign.campaign = name;
  return campaign;
}

/* ---------------- consent ---------------- */

/** What the forms actually establish. DiscoverDFW forms carry no marketing
    opt-in, so consent is at most TRANSACTIONAL (they asked us to reply):
    - email: they typed an email expecting an answer → transactional
    - sms: only an explicit replyPref of "text" (with a phone) counts —
      a phone number alone is contact info, not SMS consent.
    Automated marketing enrollment must never key off these tags alone. */
export function deriveConsent(lead: NormalizedLead): { email: string; sms: string } {
  return {
    email: lead.email ? "transactional" : "none",
    sms: lead.phone && lead.replyPref === "text" ? "transactional" : "none",
  };
}

/* ---------------- tags ---------------- */

const OFFER_SLUGS: Record<LeadKind, string> = {
  showing_request: "showing-request",
  listing_question: "listing-question",
  account_signup: "account-signup",
  guide_request: "guide-request",
};

/** Guide requests carry their specific intent as the offer slug. */
export function offerSlug(lead: Pick<NormalizedLead, "kind" | "intent">): string {
  return (lead.kind === "guide_request" && lead.intent) || OFFER_SLUGS[lead.kind];
}

const PAGE_TAGS: Record<PageType, string | null> = {
  homepage: "ddfw:homepage",
  city: "ddfw:city",
  neighborhood: "ddfw:neighborhood",
  "new-build": "ddfw:new-build",
  homes: "ddfw:homes",
  listing: "ddfw:listing",
  other: null,
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function buildTags(lead: NormalizedLead, page: PageContext): string[] {
  const consent = deriveConsent(lead);
  const tags = ["ddfw:lead", `offer:${offerSlug(lead)}`];
  const pageTag = PAGE_TAGS[page.pageType];
  if (pageTag) tags.push(pageTag);
  const citySlug = lead.citySlug || page.citySlug;
  if (citySlug) tags.push(`city:${citySlug}`);
  const communitySlug = page.hoodSlug || (lead.community ? slugify(lead.community) : null);
  if (communitySlug) tags.push(`community:${communitySlug}`);
  tags.push(`ddfw:email-consent:${consent.email}`, `ddfw:sms-consent:${consent.sms}`);
  return tags;
}

/* ---------------- readable summary ---------------- */

const KIND_LABEL: Record<LeadKind, string> = {
  showing_request: "Showing request",
  listing_question: "Listing question",
  account_signup: "Account signup",
  guide_request: "Guide request",
};

const MODE_LABEL: Record<string, string> = {
  in_person: "in person",
  live_video: "live video",
};

/** Human-readable event description for the FUB timeline. Contains the
    context an agent needs at a glance; the person's own words go in the
    event `message`, not here. */
export function buildSummary(lead: NormalizedLead, page: PageContext): string {
  const kindLine =
    lead.kind === "guide_request" && lead.intent
      ? `Guide request (${lead.intent}) via DiscoverDFW.`
      : `${KIND_LABEL[lead.kind]} via DiscoverDFW.`;
  const lines: string[] = [kindLine];
  if (lead.comparingWith) lines.push(`Comparing with: ${lead.comparingWith}`);
  if (lead.address || lead.listingKey) {
    lines.push(`Property: ${lead.address || "MLS #" + lead.listingKey}${lead.address && lead.listingKey ? ` (MLS #${lead.listingKey})` : ""}`);
  }
  const cityBit = lead.cityName || lead.citySlug || page.citySlug;
  if (cityBit) lines.push(`City: ${cityBit}`);
  const communityBit = lead.community || page.hoodSlug;
  if (communityBit) lines.push(`${page.pageType === "new-build" ? "Community" : "Neighborhood"}: ${communityBit}`);
  if (lead.kind === "showing_request" && lead.requestedDay) {
    lines.push(
      `Requested: ${lead.requestedDay}, ${lead.timeWindow || "any time"}${lead.tourMode ? `, ${MODE_LABEL[lead.tourMode] || lead.tourMode}` : ""}`
    );
  }
  if (lead.replyPref) lines.push(`Prefers reply by: ${lead.replyPref}`);
  if (lead.budget) lines.push(`Budget: ${lead.budget}`);
  if (lead.timeline) lines.push(`Timeline: ${lead.timeline}`);
  const consent = deriveConsent(lead);
  lines.push(`Consent: email ${consent.email}, SMS ${consent.sms} (no marketing opt-in collected)`);
  if (lead.sourcePage) lines.push(`Page: ${lead.sourcePage}`);
  if (lead.referrer) lines.push(`Referrer: ${lead.referrer}`);
  lines.push(`Submitted: ${lead.submittedAt}`);
  return lines.join("\n");
}

/* ---------------- event payload ---------------- */

const EVENT_TYPE: Record<LeadKind, string> = {
  showing_request: "Property Inquiry",
  listing_question: "Property Inquiry",
  account_signup: "Registration",
  guide_request: "General Inquiry",
};

export interface FubEventPayload {
  source: string;
  system?: string;
  type: string;
  message?: string;
  description: string;
  occurredAt: string;
  pageUrl?: string;
  pageReferrer?: string;
  campaign?: FubCampaign;
  person: {
    name?: string;
    emails?: { value: string }[];
    phones?: { value: string }[];
    tags: string[];
  };
  property?: {
    mlsNumber?: string;
    street?: string;
    city?: string;
    state?: string;
  };
}

export function buildEventPayload(
  lead: NormalizedLead,
  opts: { source: string; system?: string; siteUrl?: string; newBuildSlugs: ReadonlySet<string> }
): FubEventPayload {
  const page = classifyPage(lead.sourcePage, opts.newBuildSlugs);
  const payload: FubEventPayload = {
    source: opts.source,
    type: EVENT_TYPE[lead.kind],
    description: buildSummary(lead, page),
    occurredAt: lead.submittedAt,
    person: {
      ...(lead.name ? { name: lead.name } : {}),
      ...(lead.email ? { emails: [{ value: lead.email }] } : {}),
      ...(lead.phone ? { phones: [{ value: lead.phone }] } : {}),
      tags: buildTags(lead, page),
    },
  };
  if (opts.system) payload.system = opts.system;
  if (lead.message) payload.message = lead.message;
  if (lead.sourcePage && opts.siteUrl) payload.pageUrl = `${opts.siteUrl}${lead.sourcePage}`;
  if (lead.referrer) payload.pageReferrer = lead.referrer;
  const campaign = parseUtm(lead.sourcePage);
  if (campaign) payload.campaign = campaign;
  if (lead.listingKey || lead.address) {
    payload.property = {
      ...(lead.listingKey ? { mlsNumber: lead.listingKey } : {}),
      ...(lead.address ? { street: lead.address } : {}),
      ...(lead.cityName ? { city: lead.cityName } : {}),
      state: "TX",
    };
  }
  return payload;
}

/* ---------------- send-mode gating ---------------- */

/** Mirrors lib/email/resend.ts tiering, plus a production kill switch:
    - no FUB_API_KEY                              → disabled
    - FUB_DRY_RUN=1                               → dry-run (anywhere)
    - NODE_ENV !== production, no FUB_SEND_IN_DEV → dry-run
    - otherwise                                   → live */
export function resolveSendMode(env: {
  FUB_API_KEY?: string;
  FUB_DRY_RUN?: string;
  FUB_SEND_IN_DEV?: string;
  NODE_ENV?: string;
}): "disabled" | "dry-run" | "live" {
  if (!env.FUB_API_KEY) return "disabled";
  if (env.FUB_DRY_RUN === "1") return "dry-run";
  if (env.NODE_ENV !== "production" && env.FUB_SEND_IN_DEV !== "1") return "dry-run";
  return "live";
}

/* ---------------- HTTP send with retry ---------------- */

export interface FubSendConfig {
  apiKey: string;
  /** default https://api.followupboss.com/v1 */
  baseUrl?: string;
  /** registered system identifiers → X-System / X-System-Key headers */
  system?: string;
  systemKey?: string;
  /** total attempts including the first (default 3) */
  maxAttempts?: number;
}

export interface FubSendDeps {
  fetch: typeof fetch;
  /** injectable so tests never actually wait */
  sleep?: (ms: number) => Promise<void>;
}

export interface FubResult {
  ok: boolean;
  /** HTTP status of the final attempt (0 = network error) */
  status: number;
  attempts: number;
  /** FUB person id when the response carries one */
  personId?: number;
  /** true on 204 — the account's lead flow archived/ignored the event */
  ignored?: boolean;
  error?: string;
}

/** POST the event. Retry policy (duplicate-safe by design):
    - 429: docs guarantee the request was NOT processed → always safe to
      retry; honors Retry-After (capped at 10s).
    - network error / 502 / 503 / 504: retried with backoff. In the rare
      case the request WAS processed, the worst case is a duplicate
      timeline EVENT — never a duplicate contact (FUB dedupes the person
      by email/phone on every event).
    - other 4xx/5xx: fail immediately, no retry. */
export async function sendFubEvent(
  payload: FubEventPayload,
  cfg: FubSendConfig,
  deps: FubSendDeps
): Promise<FubResult> {
  const base = (cfg.baseUrl || "https://api.followupboss.com/v1").replace(/\/$/, "");
  const maxAttempts = cfg.maxAttempts ?? 3;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const auth = "Basic " + Buffer.from(`${cfg.apiKey}:`).toString("base64");
  const headers: Record<string, string> = {
    Authorization: auth,
    "Content-Type": "application/json",
  };
  if (cfg.system) headers["X-System"] = cfg.system;
  if (cfg.systemKey) headers["X-System-Key"] = cfg.systemKey;

  let last: FubResult = { ok: false, status: 0, attempts: 0, error: "not attempted" };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await deps.fetch(`${base}/events`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    } catch (e) {
      last = { ok: false, status: 0, attempts: attempt, error: e instanceof Error ? e.message : "network" };
      if (attempt < maxAttempts) await sleep(500 * attempt);
      continue;
    }

    if (res.status === 200 || res.status === 201) {
      let personId: number | undefined;
      try {
        const data = (await res.json()) as { id?: number };
        if (typeof data?.id === "number") personId = data.id;
      } catch {
        /* body optional */
      }
      return { ok: true, status: res.status, attempts: attempt, personId };
    }
    if (res.status === 204) {
      // lead flow for this source is archived — accepted but not shown
      return { ok: true, status: 204, attempts: attempt, ignored: true };
    }
    if (res.status === 429) {
      const after = Number(res.headers.get("retry-after") || "1");
      last = { ok: false, status: 429, attempts: attempt, error: "rate limited" };
      if (attempt < maxAttempts) await sleep(Math.min(Math.max(after, 1), 10) * 1000);
      continue;
    }
    if ([502, 503, 504].includes(res.status)) {
      last = { ok: false, status: res.status, attempts: attempt, error: `upstream ${res.status}` };
      if (attempt < maxAttempts) await sleep(500 * attempt);
      continue;
    }
    // hard failure (auth, validation, …) — retrying cannot help
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      /* ignore */
    }
    return { ok: false, status: res.status, attempts: attempt, error: detail || `HTTP ${res.status}` };
  }
  return last;
}

/* ---------------- log redaction ---------------- */

/** One production-safe log line — context and outcome only, never the
    person's name/email/phone/message. */
export function redactedLogLine(lead: NormalizedLead, result: { ok: boolean; status?: number; attempts?: number; personId?: number; ignored?: boolean; error?: string }, mode: string): string {
  const bits = [
    `kind=${lead.kind}`,
    `mode=${mode}`,
    `ok=${result.ok}`,
    result.status !== undefined ? `status=${result.status}` : null,
    result.attempts !== undefined ? `attempts=${result.attempts}` : null,
    result.personId !== undefined ? `personId=${result.personId}` : null,
    result.ignored ? "ignored=true" : null,
    lead.listingKey ? `listing=${lead.listingKey}` : null,
    lead.citySlug ? `city=${lead.citySlug}` : null,
    result.error ? `error=${JSON.stringify(result.error)}` : null,
  ];
  return `[fub] ${bits.filter(Boolean).join(" ")}`;
}
