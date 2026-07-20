import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { editorGate } from "@/lib/editor/api";
import { processManualUpload } from "@/lib/content/manual-upload";
import { pathsForSlot } from "@/lib/content/admin-photos";

/* Community Studio one-action photo flow: manual upload + audited CI-6
   approval in a single admin request, so a studio upload no longer needs a
   separate Photo Desk visit.

   This is a COMPOSITION, not a new publish path:
     1. the SHARED CI-7 processing core (lib/content/manual-upload.ts) —
        identical size/format/dimension/EXIF-stripping checks, storage
        write, and evidence-complete PENDING manual_upload candidate;
     2. the EXISTING atomic approve_photo_candidate RPC (0010), attributed
        to the signed-in admin — the same audited action the Photo Desk
        performs;
     3. the same revalidation + publish-event bookkeeping as the Photo
        Desk route, with failures REPORTED, never masked.

   The auto-approval is structurally scoped: the only candidate this route
   can ever approve is the manual_upload it just created from this
   request's own file — there is NO candidateId input, so Wikimedia/
   Openverse/provider-sourced or pre-existing pending candidates can never
   reach it. Alt text, attribution, and the rights confirmation are
   REQUIRED here (stricter than plain CI-7 upload, because this path ends
   published). Runs in the NODE runtime (sharp). */

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 });
  }

  const altText = String(form.get("altText") ?? "").trim();
  const caption = String(form.get("caption") ?? "").trim();
  const attributionText = String(form.get("attributionText") ?? "").trim();
  if (!altText) {
    return NextResponse.json({ ok: false, error: "Alt text is required — describe the photo for screen readers before it publishes" }, { status: 400 });
  }
  if (altText.length > 300) {
    return NextResponse.json({ ok: false, error: "Alt text is too long (300 chars max)" }, { status: 400 });
  }

  /* 1 — the shared CI-7 pipeline (pending candidate + complete evidence) */
  const uploaded = await processManualUpload(ctx.db, ctx.admin.email, {
    file: form.get("file"),
    slotId: form.get("slotId"),
    attributionText,
    caption,
    rightsConfirmed: form.get("rightsConfirmed") === "true",
  });
  if (!uploaded.ok) return NextResponse.json({ ok: false, error: uploaded.error }, { status: uploaded.status });

  /* 2 — the existing audited approval RPC, on the candidate created above */
  const { data: assetId, error: approveErr } = await ctx.db.rpc("approve_photo_candidate", {
    p_candidate_id: uploaded.candidateId,
    p_alt_text: altText,
    p_caption: caption || null,
    p_attribution_text: attributionText,
    p_admin_email: ctx.admin.email,
  });
  if (approveErr) {
    // honest partial state: the upload IS a pending candidate — say so
    const missing = /function .* does not exist/i.test(approveErr.message);
    return NextResponse.json(
      {
        ok: false,
        pendingCandidateId: uploaded.candidateId,
        error: missing
          ? "Uploaded as a PENDING candidate, but the review RPC is unavailable (migration 0010) — approve it in the Photo Desk"
          : `Uploaded as a PENDING candidate, but approval failed: ${approveErr.message} — approve it in the Photo Desk`,
      },
      { status: missing ? 503 : 500 }
    );
  }

  /* 3 — revalidate the affected public pages; the publish event records
     only after revalidation succeeds (same contract as the Photo Desk) */
  const paths = pathsForSlot(uploaded.slot.entity_type, uploaded.slot.entity_slug);
  let revalidated = true;
  let revalidateError: string | null = null;
  try {
    for (const p of paths) revalidatePath(p);
  } catch (e) {
    revalidated = false;
    revalidateError = e instanceof Error ? e.message : String(e);
  }
  if (revalidated) {
    const { error: evErr } = await ctx.db.from("verification_events").insert({
      entity_type: uploaded.slot.entity_type,
      entity_slug: uploaded.slot.entity_slug,
      verified_by: ctx.admin.email,
      verification_method: "admin_review",
      action: "publish",
      notes: `revalidated ${paths.join(", ")} (studio one-action upload+approve, slot ${uploaded.slot.slot_key})`,
    });
    if (evErr) revalidateError = `revalidated but publish event failed: ${evErr.message}`;
  }

  const kind = uploaded.slot.slot_key === "hero" ? "HERO" : "GALLERY";
  return NextResponse.json({
    ok: true,
    assetId,
    candidateId: uploaded.candidateId,
    imageUrl: uploaded.imageUrl,
    revalidated,
    revalidateError,
    note: revalidated
      ? `${kind} PHOTO IS APPROVED AND READY.`
      : `${kind} photo approved, but page revalidation FAILED (${revalidateError}) — the public page may serve stale content until revalidated`,
  });
}
