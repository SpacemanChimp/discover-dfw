"use client";
/* First-party event emitter — CLIENT-ONLY, fire-and-forget by contract.
   Nothing here may ever block navigation, search, forms, or rendering:
   every call is wrapped, the transport is sendBeacon (keepalive fetch as
   the fallback), and every failure is silent. The server re-validates
   everything against the allowlist in lib/analytics/events.ts — this
   module only shapes the submission.

   Privacy: the anonymous session id is a random token in localStorage
   (no cookies, no fingerprinting); UTM parameters are captured once per
   session at landing; paths are sent bare (the server strips queries
   anyway); admin pages never emit. */

export interface TrackContext {
  citySlug?: string;
  communitySlug?: string;
  listingKey?: string;
  intent?: string;
  scope?: string;
  view?: string;
  filterCategories?: string[];
  leadId?: string;
}

import { getSessionId } from "@/lib/session-id";

const UTM_KEY = "ddfw_utm";

/** landing UTM, captured once per browser session */
function utm(): Record<string, string> {
  try {
    const cached = sessionStorage.getItem(UTM_KEY);
    if (cached) return JSON.parse(cached);
    const sp = new URLSearchParams(window.location.search);
    const out: Record<string, string> = {};
    for (const [k, field] of [["utm_source", "utmSource"], ["utm_medium", "utmMedium"], ["utm_campaign", "utmCampaign"], ["utm_content", "utmContent"], ["utm_term", "utmTerm"]] as const) {
      const v = sp.get(k);
      if (v) out[field] = v.slice(0, 80);
    }
    sessionStorage.setItem(UTM_KEY, JSON.stringify(out));
    return out;
  } catch {
    return {};
  }
}

/** strict-mode / re-render guard: one emission per logical key per page life */
const emitted = new Set<string>();

/** Fire one allowlisted event. `onceKey` dedupes within this page's
    lifetime (double-mounted effects); the server's event_id uniqueness
    dedupes across the network. Never throws, never blocks. */
export function track(event: string, ctx: TrackContext = {}, onceKey?: string): void {
  try {
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    if (path.startsWith("/admin")) return; // admin surfaces never emit
    if (onceKey) {
      const k = `${event}:${onceKey}`;
      if (emitted.has(k)) return;
      emitted.add(k);
    }
    const sid = getSessionId(); // the SAME identity lead_events uses — funnels join to leads
    if (!sid) return;
    const body = JSON.stringify({
      event,
      eventId: crypto.randomUUID(),
      sessionId: sid,
      path,
      referrer: document.referrer || undefined,
      ...utm(),
      ...ctx,
    });
    if (navigator.sendBeacon && navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    /* analytics must never break a consumer workflow */
  }
}
