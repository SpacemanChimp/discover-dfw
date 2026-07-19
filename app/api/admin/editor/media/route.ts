import { NextResponse } from "next/server";
import sharp from "sharp";
import { editorGate, migrationMissing, migration503 } from "@/lib/editor/api";

/* Inline content media for the EDITOR desk. Distinct from Photo Desk
   slots (hero/gallery/picks stay Photo-Desk-authoritative).

   GET  → picker lists: previously uploaded editor media + already-approved
          photo_assets (their evidence lives on the asset).
   POST → one owned-image upload: same pipeline as the Photo Desk (decode
          actual bytes, jpeg/png/webp only, sharp re-encode → EXIF/GPS/XMP
          stripped by construction, 4 MB cap), rights confirmation + alt +
          attribution REQUIRED, complete evidence stored, audited. Remote
          hotlinks are impossible — the editor only accepts srcs from our
          bucket (enforced again by the server sanitizer). Storage objects
          are never deleted by any editor action. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MIN_WIDTH = 800; // inline figures — smaller than the 1200 hero minimum
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const BUCKET = "editorial-photos";

export async function GET(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const [media, assets] = await Promise.all([
    ctx.db
      .from("editor_media")
      .select("id, public_url, alt_text, caption, attribution_text, width, height, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    ctx.db
      .from("photo_assets")
      .select("id, public_image_url, alt_text, caption, attribution_text, width, height")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (media.error && migrationMissing(media.error.message)) {
    return NextResponse.json({ ok: true, migrationApplied: false, media: [], assets: [] });
  }
  return NextResponse.json({
    ok: true,
    migrationApplied: true,
    media: media.data ?? [],
    assets: assets.data ?? [],
  });
}

export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  const altText = String(form.get("altText") ?? "").trim();
  const attributionText = String(form.get("attributionText") ?? "").trim();
  const caption = String(form.get("caption") ?? "").trim();
  const rightsConfirmed = form.get("rightsConfirmed") === "true";

  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
  if (!altText) return NextResponse.json({ ok: false, error: "Alt text is required" }, { status: 400 });
  if (!attributionText)
    return NextResponse.json({ ok: false, error: "Attribution is required (e.g. PHOTO: DISCOVER DFW)" }, { status: 400 });
  if (!rightsConfirmed)
    return NextResponse.json(
      { ok: false, error: "You must confirm you have the right to use this image on DiscoverDFW.com" },
      { status: 400 }
    );
  if (file.size > MAX_UPLOAD_BYTES)
    return NextResponse.json({ ok: false, error: `File is ${(file.size / 1048576).toFixed(1)} MB — the cap is 4 MB` }, { status: 413 });

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

  const oriented = (meta.orientation ?? 1) >= 5 ? { w: meta.height ?? 0, h: meta.width ?? 0 } : { w: meta.width ?? 0, h: meta.height ?? 0 };
  if (oriented.w < MIN_WIDTH)
    return NextResponse.json({ ok: false, error: `Image is ${oriented.w}px wide — inline minimum is ${MIN_WIDTH}px` }, { status: 400 });

  // re-encode: auto-orient, cap the long edge, JPEG q82 → EXIF/GPS/XMP gone
  let processed: Buffer;
  try {
    processed = await sharp(input).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    return NextResponse.json({ ok: false, error: "Image processing failed" }, { status: 400 });
  }
  const outMeta = await sharp(processed).metadata();

  const safeName = (file.name ?? "upload").replace(/[^\w.-]+/g, "_").slice(-80);
  const storagePath = `editor/${new Date().getFullYear()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

  const { error: upErr } = await ctx.db.storage
    .from(BUCKET)
    .upload(storagePath, processed, { contentType: "image/jpeg", upsert: false });
  if (upErr) {
    const missing = /bucket.*not.*found/i.test(upErr.message);
    return NextResponse.json(
      { ok: false, error: missing ? "Storage bucket unavailable — has migration 0011 been applied?" : upErr.message },
      { status: missing ? 503 : 500 }
    );
  }
  const { data: pub } = ctx.db.storage.from(BUCKET).getPublicUrl(storagePath);

  const { data: row, error: insErr } = await ctx.db
    .from("editor_media")
    .insert({
      storage_path: storagePath,
      public_url: pub.publicUrl,
      alt_text: altText,
      caption: caption || null,
      attribution_text: attributionText,
      source_kind: "owned",
      rights_confirmed: true,
      width: outMeta.width ?? null,
      height: outMeta.height ?? null,
      uploaded_by: ctx.admin.email,
      evidence_json: {
        original: { filename: safeName, format: meta.format, width: oriented.w, height: oriented.h, bytes: file.size },
        processed: { width: outMeta.width, height: outMeta.height, mime: "image/jpeg", bytes: processed.length },
        uploaded_by: ctx.admin.email,
        uploaded_at: new Date().toISOString(),
        rights_confirmed: true,
      },
    })
    .select("id, public_url, alt_text, caption, attribution_text, width, height")
    .single();
  if (insErr) {
    if (migrationMissing(insErr.message)) return migration503();
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  await ctx.db.from("verification_events").insert({
    entity_type: "editor_media",
    entity_slug: storagePath,
    verified_by: ctx.admin.email,
    verification_method: "admin_review",
    action: "upload",
    notes: `inline image uploaded · ${safeName} · ${outMeta.width}×${outMeta.height} · rights confirmed`,
  });

  return NextResponse.json({ ok: true, media: row });
}
