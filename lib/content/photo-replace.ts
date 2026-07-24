/* Live-photo replacement — the PURE decision and validation layer, shared
   by the Photo Desk 'replace' action and the one-action upload flows and
   fixture-tested by scripts/tests/photo-replace.test.mjs (relative .ts
   imports keep it node --test runnable).

   The 0022 replace_photo_asset RPC is the AUTHORITY — every guard here is
   re-checked inside the database transaction with row locks. This module
   exists so callers can refuse obviously-invalid requests with precise
   messages before any network write, and so the guard matrix has fast
   tests that don't need a database. Keep the two in lockstep: a guard
   added to the RPC gets added here, and vice versa. */

export type ReplaceCandidateRow = {
  id: string;
  photo_slot_id: string;
  source: string;
  status: string;
  license: string | null;
  raw_api_response?: {
    result?: {
      storage_path?: string | null;
      rights_confirmed?: boolean | string | null;
    } | null;
  } | null;
};

export type ReplaceAssetRow = {
  id: string;
  photo_slot_id: string;
  selected_candidate_id: string | null;
};

export type ReplacePreflight =
  | { ok: true; idempotent: boolean }
  | { ok: false; reason: string };

/** Which audited RPC a one-action upload should call. Replacement happens
    ONLY when the caller explicitly asked for it AND the slot really has a
    live asset — an empty slot fills via the ordinary approve path even if
    the client requested replace (the modal state can be stale). */
export function chooseApprovalRpc(opts: { replaceRequested: boolean; slotHasAsset: boolean }): "replace_photo_asset" | "approve_photo_candidate" {
  return opts.replaceRequested && opts.slotHasAsset ? "replace_photo_asset" : "approve_photo_candidate";
}

/** Mirror of the replace_photo_asset guards, in the RPC's own order.
    `asset` is the slot's current live asset (null when the slot is empty). */
export function replacePreflight(
  candidate: ReplaceCandidateRow | null,
  slotId: string,
  asset: ReplaceAssetRow | null,
  input: { altText: string; attributionText: string }
): ReplacePreflight {
  if (!candidate) return { ok: false, reason: "candidate not found" };
  if (candidate.photo_slot_id !== slotId)
    return { ok: false, reason: "candidate belongs to a different slot — refusing to replace across slots" };
  if (!asset || asset.photo_slot_id !== slotId)
    return { ok: false, reason: "slot has no live asset — use APPROVE to fill an empty slot" };
  if (candidate.status === "approved" && asset.selected_candidate_id === candidate.id)
    return { ok: true, idempotent: true }; // retry of a replacement that already happened
  if (candidate.status !== "pending")
    return { ok: false, reason: `candidate is ${candidate.status} — only pending candidates can replace a live photo` };
  if (candidate.source !== "manual_upload")
    return { ok: false, reason: `only rights-confirmed manual uploads can replace a live photo — unpublish first for ${candidate.source} candidates` };
  if (!input.altText.trim()) return { ok: false, reason: "alt text is required — describe the photo for screen readers" };
  if (!input.attributionText.trim()) return { ok: false, reason: "attribution is required" };
  if (!(candidate.license ?? "").trim()) return { ok: false, reason: "candidate is missing license evidence" };
  const evidence = candidate.raw_api_response?.result;
  if (!(evidence?.storage_path ?? "").toString().trim())
    return { ok: false, reason: "manual_upload candidate is missing storage_path evidence" };
  const rights = evidence?.rights_confirmed;
  if (!(rights === true || rights === "true"))
    return { ok: false, reason: "candidate is missing rights-confirmation evidence — refusing to publish" };
  return { ok: true, idempotent: false };
}

/** Honest outcome line for the admin UI — never claims success when
    revalidation or the audit event failed. `label` names what happened
    (e.g. "HOMEPAGE-PICK PHOTO REPLACED"). */
export function revalidationOutcome(revalidated: boolean, revalidateError: string | null, label: string): string {
  if (revalidated && !revalidateError) return `${label} AND LIVE.`;
  if (revalidated) return `${label}, but the audit event failed (${revalidateError}) — investigate before relying on the trail`;
  return `${label}, but page revalidation FAILED (${revalidateError ?? "unknown"}) — the public page may serve the old photo until revalidated (use the Photo Desk's REVALIDATE)`;
}
