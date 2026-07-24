/* Guard matrix for live-photo replacement (lib/content/photo-replace.ts).
   These mirror the 0022 replace_photo_asset RPC guards — the RPC is the
   authority; this locks the shared decision layer and its messages. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseApprovalRpc, replacePreflight, revalidationOutcome } from "../../lib/content/photo-replace.ts";

const SLOT = "11111111-1111-4111-8111-111111111111";
const OTHER_SLOT = "22222222-2222-4222-8222-222222222222";

const candidate = (over = {}) => ({
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  photo_slot_id: SLOT,
  source: "manual_upload",
  status: "pending",
  license: "Owned — Discover DFW",
  raw_api_response: { result: { storage_path: "slots/homepage/x/pick/1.jpg", rights_confirmed: true } },
  ...over,
});
const asset = (over = {}) => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  photo_slot_id: SLOT,
  selected_candidate_id: "00000000-0000-4000-8000-000000000000",
  ...over,
});
const input = { altText: "Historic downtown streetscape.", attributionText: "PHOTO: DISCOVER DFW" };

test("replacing an existing asset: valid manual candidate passes preflight", () => {
  const r = replacePreflight(candidate(), SLOT, asset(), input);
  assert.deepEqual(r, { ok: true, idempotent: false });
  assert.equal(chooseApprovalRpc({ replaceRequested: true, slotHasAsset: true }), "replace_photo_asset");
});

test("filling an empty slot: routes to approve, never replace", () => {
  // even an explicit replace request falls back to approve when no asset exists
  assert.equal(chooseApprovalRpc({ replaceRequested: true, slotHasAsset: false }), "approve_photo_candidate");
  assert.equal(chooseApprovalRpc({ replaceRequested: false, slotHasAsset: false }), "approve_photo_candidate");
  // and replace preflight refuses outright with a pointer to approve
  const r = replacePreflight(candidate(), SLOT, null, input);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no live asset.*APPROVE/i);
});

test("a replace that was never requested stays on the approve path", () => {
  // the community studio path: slot has an asset but the client did not opt
  // into replacement — the approve RPC's own refusal surfaces, honestly
  assert.equal(chooseApprovalRpc({ replaceRequested: false, slotHasAsset: true }), "approve_photo_candidate");
});

test("refuses a candidate from another slot", () => {
  const r = replacePreflight(candidate({ photo_slot_id: OTHER_SLOT }), SLOT, asset(), input);
  assert.equal(r.ok, false);
  assert.match(r.reason, /different slot/);
  // and an asset from another slot can never satisfy the live-asset check
  const r2 = replacePreflight(candidate(), SLOT, asset({ photo_slot_id: OTHER_SLOT }), input);
  assert.equal(r2.ok, false);
});

test("refuses non-manual sources (wikimedia/openverse stay reviewed)", () => {
  for (const source of ["wikimedia", "openverse", "pexels", "unsplash"]) {
    const r = replacePreflight(candidate({ source }), SLOT, asset(), input);
    assert.equal(r.ok, false, source);
    assert.match(r.reason, /manual uploads/);
  }
});

test("refuses missing rights, alt text, or attribution", () => {
  const noRights = replacePreflight(
    candidate({ raw_api_response: { result: { storage_path: "s.jpg", rights_confirmed: null } } }),
    SLOT, asset(), input);
  assert.equal(noRights.ok, false);
  assert.match(noRights.reason, /rights-confirmation/);

  const falseRights = replacePreflight(
    candidate({ raw_api_response: { result: { storage_path: "s.jpg", rights_confirmed: false } } }),
    SLOT, asset(), input);
  assert.equal(falseRights.ok, false);

  const noAlt = replacePreflight(candidate(), SLOT, asset(), { ...input, altText: "  " });
  assert.equal(noAlt.ok, false);
  assert.match(noAlt.reason, /alt text/i);

  const noAttr = replacePreflight(candidate(), SLOT, asset(), { ...input, attributionText: "" });
  assert.equal(noAttr.ok, false);
  assert.match(noAttr.reason, /attribution/i);
});

test("refuses missing license or storage-path evidence", () => {
  const noLicense = replacePreflight(candidate({ license: "  " }), SLOT, asset(), input);
  assert.equal(noLicense.ok, false);
  assert.match(noLicense.reason, /license/);

  const noPath = replacePreflight(
    candidate({ raw_api_response: { result: { storage_path: "", rights_confirmed: true } } }),
    SLOT, asset(), input);
  assert.equal(noPath.ok, false);
  assert.match(noPath.reason, /storage_path/);
});

test("refuses non-pending candidates, except the idempotent retry", () => {
  for (const status of ["rejected", "needs_research"]) {
    const r = replacePreflight(candidate({ status }), SLOT, asset(), input);
    assert.equal(r.ok, false, status);
  }
  // approved but NOT the live selection → refuse (not a retry — a stale click)
  const stale = replacePreflight(candidate({ status: "approved" }), SLOT, asset(), input);
  assert.equal(stale.ok, false);
  // approved AND already the live selection → idempotent success, no rewrite
  const retry = replacePreflight(
    candidate({ status: "approved" }),
    SLOT,
    asset({ selected_candidate_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }),
    input);
  assert.deepEqual(retry, { ok: true, idempotent: true });
});

test("revalidation failure is reported, never masked as success", () => {
  assert.equal(
    revalidationOutcome(true, null, "HOMEPAGE-PICK PHOTO REPLACED"),
    "HOMEPAGE-PICK PHOTO REPLACED AND LIVE.");
  const failed = revalidationOutcome(false, "revalidatePath threw", "HOMEPAGE-PICK PHOTO REPLACED");
  assert.match(failed, /FAILED/);
  assert.match(failed, /old photo/);
  assert.match(failed, /REVALIDATE/);
  const eventFailed = revalidationOutcome(true, "insert refused", "HOMEPAGE-PICK PHOTO REPLACED");
  assert.match(eventFailed, /audit event failed/);
});
