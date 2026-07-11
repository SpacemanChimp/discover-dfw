/* CI-6 admin photo review — server-only queue reads + shared constants.
   Reads go through the service key strictly AFTER the admin gate (the
   page/API check getAdminUser() first). No provider APIs are ever called
   here; candidate thumbnails load in the reviewer's browser only. */
import "server-only";
import { getSupabaseAdmin } from "@/lib/db/admin";

/* v1: only sources whose publish rules are fully handled (attribution +
   license + source page preserved end-to-end). Unsplash needs hotlink +
   download-tracking pings, Pexels a prominent credit link — both stay
   unapprovable until implemented AND documented. The 0010 RPC enforces
   this again at the database layer. */
export const APPROVABLE_SOURCES = new Set(["wikimedia", "openverse"]);

export type ReviewCandidate = {
  id: string;
  source: string;
  approvable: boolean;
  status: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  sourcePageUrl: string | null;
  photographer: string | null;
  attributionText: string | null;
  license: string | null;
  width: number | null;
  height: number | null;
  confidenceScore: number | null;
  claudeNotes: string | null;
  flags: string[];
  rejectedReason: string | null;
};

export type ReviewSlot = {
  id: string;
  entityType: string;
  entitySlug: string;
  slotKey: string;
  label: string;
  status: string;
  asset: {
    id: string;
    publicImageUrl: string;
    altText: string;
    attributionText: string;
    license: string;
    approvedBy: string;
    approvedAt: string;
  } | null;
  candidates: ReviewCandidate[];
};

/* known-bad signatures surfaced as badges so ledger rows are one-click
   rejects — display metadata only, never a write */
function deriveFlags(imageUrl: string, claudeNotes: string | null): string[] {
  const flags: string[] = [];
  if (/ISS0|View_of_Earth/i.test(imageUrl)) flags.push("orbital");
  if (/\.pdf($|\?)/i.test(imageUrl)) flags.push("document");
  const noted = claudeNotes?.match(/\[([^\]]+)\]\s*$/)?.[1];
  if (noted) for (const f of noted.split(",").map((s) => s.trim())) if (f && !flags.includes(f)) flags.push(f);
  return flags;
}

async function fetchAllPaged<T>(build: (from: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

export async function getPhotoReviewQueue(): Promise<ReviewSlot[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const [slots, candidates, assets] = await Promise.all([
    fetchAllPaged((from) =>
      db
        .from("photo_slots")
        .select("id, entity_type, entity_slug, slot_key, label, status")
        .in("status", ["candidates_found", "approved"])
        .order("entity_type")
        .order("entity_slug")
        .order("slot_key")
        .range(from, from + 999)
    ),
    fetchAllPaged((from) =>
      db
        .from("photo_candidates")
        .select(
          "id, photo_slot_id, source, status, image_url, thumbnail_url, source_page_url, photographer, attribution_text, license, width, height, confidence_score, claude_notes, rejected_reason"
        )
        .in("status", ["pending", "needs_research"])
        .range(from, from + 999)
    ),
    fetchAllPaged((from) =>
      db
        .from("photo_assets")
        .select("id, photo_slot_id, public_image_url, alt_text, attribution_text, license, approved_by, approved_at")
        .range(from, from + 999)
    ),
  ]);

  const candidatesBySlot = new Map<string, ReviewCandidate[]>();
  for (const c of candidates as Record<string, unknown>[]) {
    const slotId = c.photo_slot_id as string;
    if (!candidatesBySlot.has(slotId)) candidatesBySlot.set(slotId, []);
    candidatesBySlot.get(slotId)!.push({
      id: c.id as string,
      source: c.source as string,
      approvable: APPROVABLE_SOURCES.has(c.source as string),
      status: c.status as string,
      imageUrl: c.image_url as string,
      thumbnailUrl: (c.thumbnail_url as string) ?? null,
      sourcePageUrl: (c.source_page_url as string) ?? null,
      photographer: (c.photographer as string) ?? null,
      attributionText: (c.attribution_text as string) ?? null,
      license: (c.license as string) ?? null,
      width: (c.width as number) ?? null,
      height: (c.height as number) ?? null,
      confidenceScore: c.confidence_score == null ? null : Number(c.confidence_score),
      claudeNotes: (c.claude_notes as string) ?? null,
      flags: deriveFlags(c.image_url as string, (c.claude_notes as string) ?? null),
      rejectedReason: (c.rejected_reason as string) ?? null,
    });
  }
  // highest score first inside a slot; unscored last
  for (const list of candidatesBySlot.values())
    list.sort((a, b) => (b.confidenceScore ?? -1) - (a.confidenceScore ?? -1));

  const assetBySlot = new Map<string, (typeof assets)[number]>();
  for (const a of assets as Record<string, unknown>[]) assetBySlot.set(a.photo_slot_id as string, a as never);

  return (slots as Record<string, unknown>[]).map((s) => {
    const a = assetBySlot.get(s.id as string) as Record<string, unknown> | undefined;
    return {
      id: s.id as string,
      entityType: s.entity_type as string,
      entitySlug: s.entity_slug as string,
      slotKey: s.slot_key as string,
      label: s.label as string,
      status: s.status as string,
      asset: a
        ? {
            id: a.id as string,
            publicImageUrl: a.public_image_url as string,
            altText: a.alt_text as string,
            attributionText: a.attribution_text as string,
            license: a.license as string,
            approvedBy: a.approved_by as string,
            approvedAt: a.approved_at as string,
          }
        : null,
      candidates: candidatesBySlot.get(s.id as string) ?? [],
    };
  });
}

/* the public path(s) an approved slot renders on — used for revalidation */
export function pathsForSlot(entityType: string, entitySlug: string): string[] {
  if (entityType === "homepage") return ["/"];
  if (entityType === "city") return [`/city/${entitySlug}`];
  if (entityType === "neighborhood") return [`/city/${entitySlug}`]; // entity_slug is "city/hood"
  return [];
}
