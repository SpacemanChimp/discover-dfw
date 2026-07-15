# Follow Up Boss integration

DiscoverDFW's normalized lead intake pushes every stored lead to Follow Up
Boss (FUB) via the official `POST /v1/events` API — the endpoint FUB
documents as the only correct path for site leads. No middleware, Zapier,
or Make flow existed before this; this is a direct server-side integration.

## Architecture

```
RequestShowingSheet ──► /api/showing-requests ─┐
AskQuestionSheet ─────► /api/listing-questions ├─► Supabase row + emails
shelf signup ─────────► /api/leads ────────────┘        │ (always first)
                                                        ▼
                                        lib/crm/fub.ts  pushLeadToFub()
                                        (server-only; env, fetch, logging)
                                                        ▼
                                        lib/crm/fub-core.ts (pure, tested)
                                        payload mapping · tags · consent ·
                                        retry · redaction
                                                        ▼
                                        POST https://api.followupboss.com/v1/events
```

Ordering is deliberate: the Supabase row and notification emails always
complete **before** the CRM push, and `pushLeadToFub` never throws — a FUB
outage can never lose or fail a lead. Every push outcome (including
dry-runs and failures) is recorded to `lead_events` as
`fub_sent` / `fub_dryrun` / `fub_failed`, so the Lead Desk keeps a full
paper trail and failures are queryable for manual replay.

## Environment variables (all SERVER-ONLY — never `NEXT_PUBLIC_`)

| Variable | Required | Purpose |
|---|---|---|
| `FUB_API_KEY` | to enable | API key from FUB → Admin → API. Unset = integration disabled; leads still store + email. |
| `FUB_SYSTEM` | recommended | Registered system name → `X-System` header + event `system`. Registered 2026-07-15 as `A-Field-Guide-To-North-Texas-Real-Estate`. |
| `FUB_SYSTEM_KEY` | recommended | Registered system key → `X-System-Key` header (issued by FUB at registration; server-only). |
| `FUB_SOURCE` | no (default `DiscoverDFW`) | Lead source label. FUB applies it to **new** contacts only — it never overwrites an existing contact's source. |
| `FUB_DRY_RUN` | no | `1` forces dry-run **anywhere**, including production (kill switch). |
| `FUB_SEND_IN_DEV` | no | `1` deliberately sends real events from a non-production environment. Otherwise dev/preview always dry-run, mirroring `EMAIL_SEND_IN_DEV`. |

Send gating (`resolveSendMode`): no key → disabled · `FUB_DRY_RUN=1` →
dry-run · non-production without `FUB_SEND_IN_DEV=1` → dry-run · else live.

## Field mapping

| DiscoverDFW context | FUB location |
|---|---|
| Source: DiscoverDFW | event `source` (+ `system`) |
| Original page URL | `pageUrl` (absolute) + `Page:` line in description |
| Page type | tag: `ddfw:homepage` / `ddfw:city` / `ddfw:neighborhood` / `ddfw:new-build` / `ddfw:homes` / `ddfw:listing` |
| City | tag `city:<slug>` + `property.city` + description |
| Neighborhood / community | tag `community:<slug>` + description |
| Offer requested | tag `offer:showing-request` / `offer:listing-question` / `offer:account-signup` + event type |
| Budget / timeline | description lines when present (current forms don't collect budget; a showing's requested day/window/mode is its timeline) |
| MLS number | `property.mlsNumber` (+ `property.street`, `state: TX`) |
| UTM attribution | `campaign` object parsed from the captured page query (`utm_source` required by FUB) |
| Email consent | tag `ddfw:email-consent:transactional\|none` + description |
| SMS consent | tag `ddfw:sms-consent:transactional\|none` + description |
| Referrer | `pageReferrer` + description |
| Submission date | `occurredAt` + description |
| Readable summary | event `description`; the person's own words go in event `message` |

Event types: showing requests and listing questions → `Property Inquiry`;
account signups → `Registration`. **No custom fields are required** — all
context travels in native event fields, tags, and the description, so
there are no custom-field IDs to configure or guess. If the team later
wants structured custom fields (e.g. budget), create them in FUB first and
extend `buildEventPayload`; do not invent `customXxx` keys.

## Consent semantics (do not weaken)

The site's forms collect **no marketing opt-in**. Consent is therefore at
most *transactional*: an email address given expecting a reply tags
`ddfw:email-consent:transactional`; SMS is `transactional` **only** when
the person explicitly chose "text" as their reply preference and gave a
phone number. A phone number alone is contact info, not SMS consent.

FUB action plans/automations trigger on `Property Inquiry` and
`Registration` events per **account settings**. Anyone configuring
automations must condition SMS/email marketing steps on these consent tags
— the integration intentionally provides them for exactly that filter.
Never auto-enroll `ddfw:sms-consent:none` contacts in texting plans.

## Dedupe, routing, and retry

- **Contact dedupe is FUB-native**: `/v1/events` matches people by email/
  phone (200 = existing contact updated, 201 = new contact created). We
  never create people directly, so retries can never duplicate a contact.
- **Ownership/routing preserved**: the payload never contains
  `assignedTo`, `assignedUserId`, or `stage` — FUB's lead-flow and routing
  rules stay in charge. A 204 response (archived lead flow) is accepted
  and flagged `ignored`.
- **Source attribution preserved**: FUB applies `source` to new contacts
  only; DiscoverDFW activity on a known contact appends to their timeline
  without touching their original attribution.
- **Retry policy** (max 3 attempts): 429 → wait `Retry-After` (docs
  guarantee the request was not processed — always safe); network errors
  and 502/503/504 → backoff retry (worst case is a duplicated timeline
  event, never a duplicated contact); other 4xx/5xx → fail immediately.
  Per-attempt timeout is 5s so a hung CRM API can't hold a visitor's
  request.

## Logging

Production logs are redacted: `[fub] kind=… mode=… ok=… status=… …` with
listing key and city slug only — never name, email, phone, or message
(see `redactedLogLine` + its test). The full lead already lives in
Supabase; logs don't need PII.

## Tests

`npm test` → `node --test scripts/tests/` runs `fub-core.test.mjs`:
payload mapping for all three lead kinds, tag taxonomy, consent rules, UTM
parsing, send-mode tiers, and the mocked HTTP behaviors (200/201/204,
429 + Retry-After, network retry, non-retryable 400, exhausted 503,
redaction). No network, no credentials.

## Configuration checklist (owner)

1. ~~Register the system~~ **Done 2026-07-15** — registered at
   <https://apps.followupboss.com/system-registration> as
   `A-Field-Guide-To-North-Texas-Real-Estate`; the issued system key lives
   in `.env.local` (and must be mirrored to Vercel).
2. ~~Create an API key~~ **Done 2026-07-15** — key verified against
   `GET /v1/me` (200, admin). It lives in `.env.local` alongside a
   `FUB_DRY_RUN=1` guard: local `next start` servers run with
   `NODE_ENV=production`, so without the guard a local server could push
   real events. Remove the guard locally only for the approved
   supervised test.
3. In Vercel → Settings → Environment Variables (Production), set:
   `FUB_API_KEY`, `FUB_SYSTEM=A-Field-Guide-To-North-Texas-Real-Estate`,
   `FUB_SYSTEM_KEY` (same values as `.env.local` — do **not** set
   `FUB_DRY_RUN` there, or set it to empty). This is the step that turns
   the integration on in production.
4. In FUB, confirm the lead flow for source "DiscoverDFW" is active and
   routed to the intended agent/pond (the integration does not assign).
5. Review action plans triggered by `Property Inquiry` / `Registration`:
   any SMS or marketing steps must filter on `ddfw:sms-consent` /
   `ddfw:email-consent` tags.
6. **Supervised test (requires explicit owner approval — never send a
   real test lead without it):** in a non-production environment set
   `FUB_SEND_IN_DEV=1` with the real key, submit one test lead using an
   owner-controlled email address, verify the contact/event/tags/consent
   render correctly in FUB, then delete the test contact and unset
   `FUB_SEND_IN_DEV`.
7. Keep `FUB_DRY_RUN` unset in production; set `FUB_DRY_RUN=1` to pause
   the integration instantly without a deploy.
