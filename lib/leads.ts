/* Shared plumbing for the lead-capture routes (showing requests, listing
   questions). SERVER-ONLY — writes go through the secret-key client because
   the lead tables have no anon RLS policies; these helpers are the only
   door in. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/db/server";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shared spam-check fields every lead form submits. */
export interface SpamFields {
  /** Honeypot — humans never see the field; bots fill it. */
  hp?: string;
  /** Epoch ms when the sheet was opened — sub-3s submits are bots. */
  openedAt?: number;
}

/* Silent drop for bots: pretend success so the bot moves on, store nothing.
   Two cheap signals — the honeypot field and a minimum dwell time. */
export function looksLikeSpam(s: SpamFields): boolean {
  if (s.hp && s.hp.trim() !== "") return true;
  if (typeof s.openedAt === "number" && Date.now() - s.openedAt < 3000) return true;
  return false;
}

/** Signed-in user id when there is a session; null for guests. */
export async function currentUserId(): Promise<string | null> {
  try {
    const session = await getSupabaseServer();
    return (await session?.auth.getUser())?.data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** One analytics row per lead-generating action. Never throws. */
export async function recordLeadEvent(
  admin: SupabaseClient,
  event: {
    userId: string | null;
    sessionId: string | null;
    eventType: string;
    listingKey: string | null;
    citySlug: string | null;
    sourcePage: string;
    metadata: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await admin.from("lead_events").insert({
    user_id: event.userId,
    session_id: event.sessionId,
    event_type: event.eventType,
    listing_key: event.listingKey,
    city_slug: event.citySlug,
    source_page: event.sourcePage,
    metadata: event.metadata,
  });
  if (error) console.error("[lead-event] insert failed:", error.message);
}

/* Lead notification emails live in lib/email/lead-emails.ts — branded
   templates, guide heads-up + submitter confirmation, attempt logging. */
