/* Editorial photo reads for the Content Intelligence Loop (CI-3).
   SERVER-ONLY — photo_slots/photo_assets keep RLS-enabled-no-policies, so
   reads go through the secret key during server renders (same door as
   lib/db/admin.ts) and the browser only ever receives finished HTML.
   Every failure path — missing env, query error, timeout — resolves to an
   empty map so the surface renders its editorial placeholder, never a
   broken page. Assets only exist once a human approves them (CI-6); this
   module cannot surface anything else, and never MLS imagery. */
import "server-only";
import { getSupabaseAdmin } from "@/lib/db/admin";

export type EntityType = "city" | "neighborhood" | "homepage";

export type ApprovedPhoto = {
  publicImageUrl: string;
  altText: string;
  caption: string | null;
  attributionText: string;
  sourcePageUrl: string | null;
  width: number | null;
  height: number | null;
};

/* Composite key: homepage picks share slot_key='pick' across four cities,
   so slot_key alone would collide. */
export const photoKey = (entitySlug: string, slotKey: string) => `${entitySlug}::${slotKey}`;

const QUERY_TIMEOUT_MS = 3000;

/* Dev-only mock so the approved-photo path (<img> + attribution chip) can
   be exercised without writing rows anywhere: requires BOTH a
   non-production build AND CONTENT_EDITORIAL_PHOTO_MOCK=1. The image is a
   data: URI so nothing is fetched from the network. */
const MOCK_SLOT_KEYS: Record<EntityType, string[]> = {
  city: ["gallery-0", "gallery-1", "gallery-2"],
  neighborhood: ["hero"],
  homepage: ["pick"],
};

const MOCK_IMAGE =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">' +
      '<rect width="800" height="600" fill="#F6F1E6"/>' +
      '<rect x="10" y="10" width="780" height="580" fill="none" stroke="#1D1913" stroke-width="6"/>' +
      '<circle cx="400" cy="255" r="95" fill="#D9481F"/>' +
      '<text x="400" y="435" font-family="monospace" font-size="32" letter-spacing="8" text-anchor="middle" fill="#1D1913">MOCK EDITORIAL PHOTO</text>' +
      "</svg>"
  );

function mockPhotos(entityType: EntityType, slugs: string[]): Map<string, ApprovedPhoto> {
  const photos = new Map<string, ApprovedPhoto>();
  for (const slug of slugs)
    for (const slotKey of MOCK_SLOT_KEYS[entityType])
      photos.set(photoKey(slug, slotKey), {
        publicImageUrl: MOCK_IMAGE,
        altText: `Mock editorial photo for ${slug} ${slotKey} (dev only)`,
        caption: null,
        attributionText: "MOCK PHOTO — DEV ONLY / JANE DOE VIA EXAMPLE",
        sourcePageUrl: "https://example.com/mock-photo",
        width: 800,
        height: 600,
      });
  return photos;
}

/* One query per call. Pass every entity_slug a page needs at once (the
   homepage passes all four pick slugs) — result is keyed by photoKey(). */
export async function getApprovedPhotos(
  entityType: EntityType,
  entitySlug: string | string[]
): Promise<Map<string, ApprovedPhoto>> {
  const slugs = Array.isArray(entitySlug) ? entitySlug : [entitySlug];
  const photos = new Map<string, ApprovedPhoto>();
  if (slugs.length === 0) return photos;

  if (process.env.NODE_ENV !== "production" && process.env.CONTENT_EDITORIAL_PHOTO_MOCK === "1")
    return mockPhotos(entityType, slugs);

  const db = getSupabaseAdmin();
  if (!db) return photos;

  // AbortController (not a bare Promise.race) so a timed-out read cancels
  // the underlying request instead of leaving a dangling handle.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
  try {
    const { data, error } = await db
      .from("photo_slots")
      .select(
        "entity_slug, slot_key, photo_assets!inner(public_image_url, alt_text, caption, attribution_text, source_page_url, width, height)"
      )
      .eq("entity_type", entityType)
      .in("entity_slug", slugs)
      .eq("status", "approved")
      .abortSignal(controller.signal);
    if (error) {
      console.warn(`editorial photos: read failed (${entityType}) — rendering placeholders`);
      return photos;
    }
    for (const row of data ?? []) {
      // one-to-one embed can arrive as object or single-element array
      const asset = Array.isArray(row.photo_assets) ? row.photo_assets[0] : row.photo_assets;
      if (!asset?.public_image_url || !asset.alt_text || !asset.attribution_text) continue;
      photos.set(photoKey(row.entity_slug, row.slot_key), {
        publicImageUrl: asset.public_image_url,
        altText: asset.alt_text,
        caption: asset.caption ?? null,
        attributionText: asset.attribution_text,
        sourcePageUrl: asset.source_page_url ?? null,
        width: asset.width ?? null,
        height: asset.height ?? null,
      });
    }
    return photos;
  } catch {
    console.warn(`editorial photos: read aborted (${entityType}) — rendering placeholders`);
    return photos;
  } finally {
    clearTimeout(timer);
  }
}
