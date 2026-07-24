import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { editorGate } from "@/lib/editor/api";
import { processManualUpload } from "@/lib/content/manual-upload";
import { pathsForSlot } from "@/lib/content/admin-photos";
import { chooseApprovalRpc, revalidationOutcome } from "@/lib/content/photo-replace";

/* One-action photo flow (Community Studio + Visual Builder homepage
   picks): manual upload + audited CI-6 publication in a single admin
   request, so an upload no longer needs a separate Photo Desk visit.

   This is a COMPOSITION, not a new publish path:
     1. the SHARED CI-7 processing core (lib/content/manual-upload.ts) —
        identical size/format/dimension/EXIF-stripping checks, storage
        write, and evidence-complete PENDING manual_upload candidate;
     2. an EXISTING atomic RPC, attributed to the signed-in admin — the
        same audited actions the Photo Desk performs:
          · empty slot → approve_photo_candidate (0010/0011)
          · live slot + explicit replaceExisting=true → replace_photo_asset
            (0022) — the live photo swaps in ONE transaction, no blank-card
            window, and the outgoing candidate returns to the review queue;
     3. the same revalidation + publish-event bookkeeping as the Photo
        Desk route, with failures REPORTED, never masked.

   The auto-publication is structurally scoped: the only candidate this
   route can ever approve OR promote over a live photo is the manual_upload
   it just created from this request's own file — there is NO candidateId
   input, so Wikimedia/Openverse/provider-sourced or pre-existing pending
   candidates can never reach it. Replacement additionally requires the
   caller to say so (replaceExisting=true) — without the flag a live slot
   fails with an honest pointer to the replace flow, exactly as before.
   Alt text, attribution, and the rights confirmation are REQUIRED here
   (stricter than plain CI-7 upload, because this path ends published).
   Runs in the NODE runtime (sharp). */

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

  /* 2 — the audited RPC on the candidate created above. Replacement only
     happens when the client EXPLICITLY asked (replaceExisting=true) AND
     the slot really has a live asset; otherwise the ordinary approve path
     runs and refuses a live slot with its usual honest error. */
  const replaceRequested = form.get("replaceExisting") === "true";
  const { data: liveAsset } = await ctx.db
    .from("photo_assets")
    .select("id, selected_candidate_id")
    .eq("photo_slot_id", uploaded.slot.id)
    .maybeSingle();
  const rpc = chooseApprovalRpc({ replaceRequested, slotHasAsset: Boolean(liveAsset) });
  const replaced = rpc === "replace_photo_asset";

  const { data: assetId, error: approveErr } = replaced
    ? await ctx.db.rpc("replace_photo_asset", {
        p_candidate_id: uploaded.candidateId,
        p_slot_id: uploaded.slot.id,
        p_alt_text: altText,
        p_caption: caption || null,
        p_attribution_text: attributionText,
        p_admin_email: ctx.admin.email,
      })
    : await ctx.db.rpc("approve_photo_candidate", {
        p_candidate_id: uploaded.candidateId,
        p_alt_text: altText,
        p_caption: caption || null,
        p_attribution_text: attributionText,
        p_admin_email: ctx.admin.email,
      });
  if (approveErr) {
    // honest partial state: the upload IS a pending candidate — say so
    const missing = /function .* does not exist/i.test(approveErr.message);
    const liveRefusal = /already has an approved asset/i.test(approveErr.message);
    return NextResponse.json(
      {
        ok: false,
        pendingCandidateId: uploaded.candidateId,
        error: missing
          ? `Uploaded as a PENDING candidate, but the ${replaced ? "replace RPC is unavailable (migration 0022)" : "review RPC is unavailable (migration 0010)"} — finish it in the Photo Desk`
          : liveRefusal
            ? "Uploaded as a PENDING candidate — this slot already has a LIVE photo, and this request didn't ask to replace it. Use the REPLACE flow (or the Photo Desk's REPLACE LIVE PHOTO action) to publish it over the current photo."
            : `Uploaded as a PENDING candidate, but ${replaced ? "replacement" : "approval"} failed: ${approveErr.message} — finish it in the Photo Desk`,
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
      notes: `revalidated ${paths.join(", ")} (one-action upload+${replaced ? "replace" : "approve"}, slot ${uploaded.slot.slot_key})`,
    });
    if (evErr) revalidateError = `revalidated but publish event failed: ${evErr.message}`;
  }

  const kind = uploaded.slot.slot_key === "pick" ? "HOMEPAGE-PICK" : uploaded.slot.slot_key === "hero" ? "HERO" : "GALLERY";
  return NextResponse.json({
    ok: true,
    assetId,
    candidateId: uploaded.candidateId,
    imageUrl: uploaded.imageUrl,
    replaced,
    revalidated,
    revalidateError,
    note: revalidationOutcome(revalidated, revalidateError, `${kind} PHOTO ${replaced ? "REPLACED" : "APPROVED"}`),
  });
}
