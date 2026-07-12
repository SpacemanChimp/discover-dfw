/* New Build Controls (admin) — SERVER-ONLY reader.

   One row per new_build_communities entry with its latest inventory
   snapshot and computed caution states. Read-only: the publish flip
   lives in the admin API route (typed confirmation, audit row,
   revalidate) and each FIRST flip through the UI is its own supervised
   gate — this module never writes. */
import "server-only";
import { getSupabaseAdmin } from "@/lib/db/admin";

export type NbControlRow = {
  id: string;
  slug: string; // city/hood
  name: string;
  citySlug: string;
  hoodSlug: string | null;
  published: boolean;
  status: string;
  snapshot: {
    active: number;
    pending: number;
    qmi: number;
    calculatedAt: string;
  } | null;
  cautions: string[];
};

const STALE_MS = 7 * 24 * 3600 * 1000;

export async function getNbControlRows(): Promise<NbControlRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  try {
    const [{ data: communities }, { data: snaps }] = await Promise.all([
      db.from("new_build_communities").select("id, slug, name, city_slug, hood_slug, published, status").order("slug"),
      db
        .from("community_inventory_stats")
        .select("community_id, active_listing_count, pending_listing_count, quick_move_in_count, calculated_at")
        .order("calculated_at", { ascending: false }),
    ]);
    // first snapshot per community = latest (ordered desc)
    const latest = new Map<string, NonNullable<typeof snaps>[number]>();
    for (const s of snaps ?? []) if (!latest.has(s.community_id)) latest.set(s.community_id, s);

    return (communities ?? []).map((c) => {
      const s = latest.get(c.id);
      const snapshot = s
        ? {
            active: s.active_listing_count ?? 0,
            pending: s.pending_listing_count ?? 0,
            qmi: s.quick_move_in_count ?? 0,
            calculatedAt: s.calculated_at,
          }
        : null;
      const cautions: string[] = [];
      if (!c.hood_slug) cautions.push("NO HOOD PAGE — nothing to render a band on");
      if (!snapshot) cautions.push("NO SNAPSHOT — run NB-1 --stats first");
      else {
        if (snapshot.active < 3) cautions.push("UNDER 3 ACTIVE — the band hides itself even if published");
        if (snapshot.pending > 20 && snapshot.pending > 2 * snapshot.active)
          cautions.push(`PENDING ANOMALY — ${snapshot.pending} pending vs ${snapshot.active} active; eyeball before publishing`);
        if (Date.now() - new Date(snapshot.calculatedAt).getTime() > STALE_MS)
          cautions.push("STALE SNAPSHOT — older than 7 days; re-run --stats before flipping");
      }
      return {
        id: c.id,
        slug: c.slug,
        name: c.name,
        citySlug: c.city_slug,
        hoodSlug: c.hood_slug,
        published: c.published,
        status: c.status,
        snapshot,
        cautions,
      };
    });
  } catch {
    return [];
  }
}
