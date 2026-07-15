/* Follow Up Boss server binding. SERVER-ONLY — the API key never reaches
   the browser. All mapping/retry logic lives in ./fub-core (pure, tested);
   this file supplies env, fetch, city-name resolution, and logging.

   Called fire-and-safe from the lead intake routes AFTER the Supabase row
   is stored: a CRM outage can never lose or fail a lead. Every push
   outcome is recorded to lead_events (fub_push) so the Lead Desk retains
   a paper trail; production logs are redacted (no names/emails/phones —
   see redactedLogLine). */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bySlug, newBuilds } from "@/lib/dfw-data";
import { slugifyHood } from "@/lib/slug";
import { SITE_URL } from "@/lib/site";
import { recordLeadEvent } from "@/lib/leads";
import {
  buildEventPayload,
  redactedLogLine,
  resolveSendMode,
  sendFubEvent,
  type FubResult,
  type NormalizedLead,
} from "./fub-core";

export type { NormalizedLead } from "./fub-core";

const newBuildSlugs: ReadonlySet<string> = new Set(newBuilds.map((nb) => slugifyHood(nb.name)));

let warnedUnconfigured = false;

/** Push one stored lead to Follow Up Boss. Never throws; never blocks the
    lead itself (callers already persisted + emailed). */
export async function pushLeadToFub(admin: SupabaseClient | null, lead: NormalizedLead): Promise<void> {
  try {
    const mode = resolveSendMode(process.env);
    if (mode === "disabled") {
      if (!warnedUnconfigured) {
        warnedUnconfigured = true;
        console.log("[fub] FUB_API_KEY not set — CRM push disabled (leads still stored + emailed)");
      }
      return;
    }

    const withCity: NormalizedLead = {
      ...lead,
      cityName: lead.citySlug ? bySlug[lead.citySlug]?.name ?? null : null,
    };
    const payload = buildEventPayload(withCity, {
      source: process.env.FUB_SOURCE || "DiscoverDFW",
      system: process.env.FUB_SYSTEM || undefined,
      siteUrl: SITE_URL,
      newBuildSlugs,
    });

    let result: FubResult;
    if (mode === "dry-run") {
      result = { ok: true, status: 0, attempts: 0 };
      console.log(redactedLogLine(withCity, result, "dry-run"));
    } else {
      result = await sendFubEvent(
        payload,
        {
          apiKey: process.env.FUB_API_KEY!,
          system: process.env.FUB_SYSTEM || undefined,
          systemKey: process.env.FUB_SYSTEM_KEY || undefined,
        },
        {
          // per-attempt timeout — a hung CRM API must not hold the response
          fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }),
        }
      );
      const line = redactedLogLine(withCity, result, "live");
      if (result.ok) console.log(line);
      else console.error(line);
    }

    if (admin) {
      await recordLeadEvent(admin, {
        userId: lead.userId ?? null,
        sessionId: lead.sessionId,
        eventType: result.ok ? (mode === "dry-run" ? "fub_dryrun" : "fub_sent") : "fub_failed",
        listingKey: lead.listingKey,
        citySlug: lead.citySlug,
        sourcePage: (lead.sourcePage || "").slice(0, 300),
        // context + outcome only — no PII in the event trail
        metadata: {
          kind: lead.kind,
          mode,
          status: result.status,
          attempts: result.attempts,
          personId: result.personId ?? null,
          ignored: result.ignored ?? false,
          error: result.error ?? null,
        },
      });
    }
  } catch (e) {
    // integration failures must never surface to the lead's request
    console.error("[fub] push crashed:", e instanceof Error ? e.message : e);
  }
}
