/* CI-7 manual photo upload — the SHARED processing core, SERVER-ONLY.
   Extracted verbatim from app/api/admin/photos/upload/route.ts so the
   Photo Desk upload route and the Community Studio's one-action
   upload-&-approve route run the IDENTICAL pipeline: size cap → decode the
   actual bytes (Content-Type never trusted) → format/dimension/orientation
   checks → sharp re-encode (auto-orient, ≤2400px, JPEG q82 — EXIF/GPS/XMP
   stripped by construction) → storage write → PENDING manual_upload
   candidate with complete source evidence. Publishing stays the separate
   audited CI-6 approve action in every caller. */
import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel body limit is 4.5 MB
export const MIN_WIDTH = 1200;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const BUCKET = "editorial-photos";
export const MANUAL_LICENSE = "Owned — Discover DFW";

export type ManualUploadResult =
  | { ok: true; candidateId: string; imageUrl: string; width: number | null; height: number | null; slot: { id: string; entity_type: string; entity_slug: string; slot_key: string } }
  | { ok: false; error: string; status: number };

export async function processManualUpload(
  db: SupabaseClient,
  adminEmail: string,
  input: { file: unknown; slotId: unknown; attributionText: string; caption: string; rightsConfirmed: boolean }
): Promise<ManualUploadResult> {
  const { file, slotId, attributionText, caption, rightsConfirmed } = input;

  if (!(file instanceof File)) return { ok: false, error: "Missing file", status: 400 };
  if (typeof slotId !== "string" || !/^[0-9a-f-]{36}$/i.test(slotId)) return { ok: false, error: "Missing slotId", status: 400 };
  if (!attributionText) return { ok: false, error: "Attribution is required (e.g. PHOTO: DISCOVER DFW)", status: 400 };
  if (!rightsConfirmed)
    return { ok: false, error: "You must confirm you have the right to use this photo on DiscoverDFW.com", status: 400 };
  if (file.size > MAX_UPLOAD_BYTES)
    return { ok: false, error: `File is ${(file.size / 1048576).toFixed(1)} MB — the v1 cap is 4 MB (Vercel body limit is 4.5 MB)`, status: 413 };

  const { data: slot, error: slotErr } = await db
    .from("photo_slots")
    .select("id, entity_type, entity_slug, slot_key, label, preferred_orientation")
    .eq("id", slotId)
    .single();
  if (slotErr || !slot) return { ok: false, error: "Slot not found", status: 404 };

  // decode the ACTUAL bytes — Content-Type is never trusted
  const inputBuf = Buffer.from(await file.arrayBuffer());
  let meta: sharp.Metadata;
  try {
    meta = await sharp(inputBuf).metadata();
  } catch {
    return { ok: false, error: "File is not a decodable image", status: 400 };
  }
  if (!ACCEPTED_FORMATS.has(meta.format ?? ""))
    return { ok: false, error: `Format ${meta.format ?? "unknown"} not accepted (jpeg/png/webp only)`, status: 400 };

  // dimensions AFTER EXIF orientation (a rotated phone photo reports
  // swapped width/height until .rotate() is applied)
  const oriented = (meta.orientation ?? 1) >= 5 ? { w: meta.height ?? 0, h: meta.width ?? 0 } : { w: meta.width ?? 0, h: meta.height ?? 0 };
  if (oriented.w < MIN_WIDTH) return { ok: false, error: `Image is ${oriented.w}px wide — minimum is ${MIN_WIDTH}px`, status: 400 };
  if (slot.preferred_orientation === "landscape" && oriented.w <= oriented.h)
    return { ok: false, error: "This slot needs a landscape image (width > height)", status: 400 };
  if (slot.preferred_orientation === "portrait" && oriented.h <= oriented.w)
    return { ok: false, error: "This slot needs a portrait image (height > width)", status: 400 };

  // web-ready re-encode: auto-orient (applies + drops EXIF orientation),
  // cap the long edge, JPEG q82. No .withMetadata() → EXIF/GPS/XMP gone.
  let processed: Buffer;
  try {
    processed = await sharp(inputBuf).rotate().resize({ width: 2400, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    return { ok: false, error: "Image processing failed", status: 400 };
  }
  const outMeta = await sharp(processed).metadata();

  const safeName = (file.name ?? "upload").replace(/[^\w.-]+/g, "_").slice(-80); // basename only, no paths
  const storagePath = `slots/${slot.entity_type}/${slot.entity_slug.replace(/\//g, "__")}/${slot.slot_key}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

  const { error: upErr } = await db.storage.from(BUCKET).upload(storagePath, processed, { contentType: "image/jpeg", upsert: false });
  if (upErr) {
    const missing = /bucket.*not.*found/i.test(upErr.message);
    return {
      ok: false,
      error: missing ? "Storage bucket unavailable — has migration 0011_manual_uploads.sql been applied?" : upErr.message,
      status: missing ? 503 : 500,
    };
  }
  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(storagePath);

  // pending candidate ONLY — publish is the separate CI-6 approve action
  const { data: candidate, error: insErr } = await db
    .from("photo_candidates")
    .insert({
      photo_slot_id: slot.id,
      source: "manual_upload",
      external_id: storagePath,
      image_url: pub.publicUrl,
      thumbnail_url: pub.publicUrl,
      source_page_url: null,
      photographer: adminEmail,
      attribution_text: attributionText,
      license: MANUAL_LICENSE,
      width: outMeta.width ?? null,
      height: outMeta.height ?? null,
      raw_api_response: {
        provider: "manual_upload",
        query: null,
        retrieved_at: new Date().toISOString(),
        result: {
          strategy: "manual_upload",
          source: "manual_upload",
          storage_path: storagePath,
          processed: { width: outMeta.width, height: outMeta.height, mime: "image/jpeg", bytes: processed.length },
          original: { filename: safeName, format: meta.format, width: oriented.w, height: oriented.h, bytes: file.size },
          uploaded_by: adminEmail,
          uploaded_at: new Date().toISOString(),
          attribution_text: attributionText,
          caption: caption || null,
          rights_confirmed: true,
        },
      },
    })
    .select("id")
    .single();
  if (insErr) return { ok: false, error: insErr.message, status: 500 };

  return {
    ok: true,
    candidateId: candidate.id as string,
    imageUrl: pub.publicUrl,
    width: outMeta.width ?? null,
    height: outMeta.height ?? null,
    slot: { id: slot.id as string, entity_type: slot.entity_type as string, entity_slug: slot.entity_slug as string, slot_key: slot.slot_key as string },
  };
}
