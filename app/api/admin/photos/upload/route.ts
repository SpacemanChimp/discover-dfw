import { NextResponse } from "next/server";
import sharp from "sharp";
import { getAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/db/admin";

/* CI-7 manual photo upload. Admin-only (same ADMIN_EMAILS gate as the
   Photo Desk — checked before anything is read); one file per request;
   creates a PENDING manual_upload photo_candidate only. Publishing stays
   a separate explicit confirmation through the CI-6 approve RPC — no
   second publish path, no bulk anything, no silent replace.

   Runs in the NODE runtime (sharp needs native bindings — never Edge).
   Vercel serverless request bodies are capped at 4.5 MB, so the v1
   upload cap is 4 MB (documented, enforced below). The uploaded bytes
   are decoded and RE-ENCODED via sharp (auto-orient → resize to max
   2400px → JPEG q82): re-encoding produces a web-ready file and strips
   EXIF/GPS/XMP metadata by construction. v1 stores only the processed
   file in the editorial-photos bucket (public read; writes only via the
   service key server-side). */

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel body limit is 4.5 MB
const MIN_WIDTH = 1200;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const BUCKET = "editorial-photos";
const MANUAL_LICENSE = "Owned — Discover DFW";

export async function POST(req: Request) {
  const adminUser = await getAdminUser();
  if (!adminUser) return NextResponse.json({ ok: false }, { status: 404 }); // don't advertise the surface

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  const slotId = form.get("slotId");
  const attributionText = String(form.get("attributionText") ?? "").trim();
  const caption = String(form.get("caption") ?? "").trim();
  const rightsConfirmed = form.get("rightsConfirmed") === "true";

  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
  if (typeof slotId !== "string" || !/^[0-9a-f-]{36}$/i.test(slotId))
    return NextResponse.json({ ok: false, error: "Missing slotId" }, { status: 400 });
  if (!attributionText)
    return NextResponse.json({ ok: false, error: "Attribution is required (e.g. PHOTO: DISCOVER DFW)" }, { status: 400 });
  if (!rightsConfirmed)
    return NextResponse.json(
      { ok: false, error: "You must confirm you have the right to use this photo on DiscoverDFW.com" },
      { status: 400 }
    );
  if (file.size > MAX_UPLOAD_BYTES)
    return NextResponse.json(
      { ok: false, error: `File is ${(file.size / 1048576).toFixed(1)} MB — the v1 cap is 4 MB (Vercel body limit is 4.5 MB)` },
      { status: 413 }
    );

  const { data: slot, error: slotErr } = await db
    .from("photo_slots")
    .select("id, entity_type, entity_slug, slot_key, label, preferred_orientation")
    .eq("id", slotId)
    .single();
  if (slotErr || !slot) return NextResponse.json({ ok: false, error: "Slot not found" }, { status: 404 });

  // decode the ACTUAL bytes — Content-Type is never trusted
  const input = Buffer.from(await file.arrayBuffer());
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    return NextResponse.json({ ok: false, error: "File is not a decodable image" }, { status: 400 });
  }
  if (!ACCEPTED_FORMATS.has(meta.format ?? ""))
    return NextResponse.json({ ok: false, error: `Format ${meta.format ?? "unknown"} not accepted (jpeg/png/webp only)` }, { status: 400 });

  // dimensions AFTER EXIF orientation (a rotated phone photo reports
  // swapped width/height until .rotate() is applied)
  const oriented = (meta.orientation ?? 1) >= 5 ? { w: meta.height ?? 0, h: meta.width ?? 0 } : { w: meta.width ?? 0, h: meta.height ?? 0 };
  if (oriented.w < MIN_WIDTH)
    return NextResponse.json({ ok: false, error: `Image is ${oriented.w}px wide — minimum is ${MIN_WIDTH}px` }, { status: 400 });
  if (slot.preferred_orientation === "landscape" && oriented.w <= oriented.h)
    return NextResponse.json({ ok: false, error: "This slot needs a landscape image (width > height)" }, { status: 400 });
  if (slot.preferred_orientation === "portrait" && oriented.h <= oriented.w)
    return NextResponse.json({ ok: false, error: "This slot needs a portrait image (height > width)" }, { status: 400 });

  // web-ready re-encode: auto-orient (applies + drops EXIF orientation),
  // cap the long edge, JPEG q82. No .withMetadata() → EXIF/GPS/XMP gone.
  let processed: Buffer;
  try {
    processed = await sharp(input).rotate().resize({ width: 2400, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    return NextResponse.json({ ok: false, error: "Image processing failed" }, { status: 400 });
  }
  const outMeta = await sharp(processed).metadata();

  const safeName = (file.name ?? "upload").replace(/[^\w.-]+/g, "_").slice(-80); // basename only, no paths
  const storagePath = `slots/${slot.entity_type}/${slot.entity_slug.replace(/\//g, "__")}/${slot.slot_key}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(storagePath, processed, { contentType: "image/jpeg", upsert: false });
  if (upErr) {
    const missing = /bucket.*not.*found/i.test(upErr.message);
    return NextResponse.json(
      { ok: false, error: missing ? "Storage bucket unavailable — has migration 0011_manual_uploads.sql been applied?" : upErr.message },
      { status: missing ? 503 : 500 }
    );
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
      photographer: adminUser.email,
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
          uploaded_by: adminUser.email,
          uploaded_at: new Date().toISOString(),
          attribution_text: attributionText,
          caption: caption || null,
          rights_confirmed: true,
        },
      },
    })
    .select("id")
    .single();
  if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    candidateId: candidate.id,
    imageUrl: pub.publicUrl,
    width: outMeta.width,
    height: outMeta.height,
    note: "Pending candidate created — publish via APPROVE in the Photo Desk",
  });
}
