/* New Build Intelligence — public inventory band reader (server-only).
   Returns the latest inventory snapshot for a PUBLISHED new-build
   community, or null. Null on every other path — unpublished (all 19
   communities today), no snapshot, thin inventory, missing env, query
   error, timeout — and a null renders the hood page exactly as it is
   today. The counts come from OUR replicated NTREIS store (the same
   compliance class as the live city market bands, Phase 20); builder
   names, price medians, and status claims are deliberately NOT exposed —
   those require human verification before publishing (hard rules). */
import "server-only";
import { getSupabaseAdmin } from "@/lib/db/admin";

export type NewBuildInventory = {
  activeCount: number;
  pendingCount: number;
  quickMoveInEst: number;
  asOf: string; // ISO timestamp of the snapshot
};

/* below this, the band does not render at all — a near-empty community
   must read as "no band", never as a bleak zero */
const MIN_ACTIVE_TO_SHOW = 3;
const QUERY_TIMEOUT_MS = 3000;

export async function getNewBuildInventory(citySlug: string, hoodSlug: string): Promise<NewBuildInventory | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
  try {
    const { data: community, error } = await db
      .from("new_build_communities")
      .select("id")
      .eq("city_slug", citySlug)
      .eq("hood_slug", hoodSlug)
      .eq("published", true) // the per-community kill switch
      .abortSignal(controller.signal)
      .maybeSingle();
    if (error || !community) return null;

    const { data: snap, error: snapErr } = await db
      .from("community_inventory_stats")
      .select("active_listing_count, pending_listing_count, quick_move_in_count, calculated_at")
      .eq("community_id", community.id)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .abortSignal(controller.signal)
      .maybeSingle();
    if (snapErr || !snap) return null;
    if ((snap.active_listing_count ?? 0) < MIN_ACTIVE_TO_SHOW) return null;

    return {
      activeCount: snap.active_listing_count,
      pendingCount: snap.pending_listing_count ?? 0,
      quickMoveInEst: snap.quick_move_in_count ?? 0,
      asOf: snap.calculated_at,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
