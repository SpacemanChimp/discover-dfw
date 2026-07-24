import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { pathsForSlot } from "@/lib/content/admin-photos";
import { replacePreflight, type ReplaceCandidateRow } from "@/lib/content/photo-replace";

/* CI-6 photo review actions. Admin-only (env allowlist, checked on every
   request); the service-role client is used strictly AFTER the gate.
   Every multi-write action is a 0010/0022 plpgsql RPC — atomic at the
   database, so photo_assets can never disagree with candidate/slot/events.
   Exactly ONE candidate per request: arrays are rejected, there is no bulk
   path, and nothing here runs without a human admin POST. Revalidation is
   best-effort but observable: the 'publish' audit event is written ONLY
   after revalidatePath succeeds, and failures are reported in the
   response instead of being masked. */

const ACTIONS = new Set(["approve", "reject", "needs_research", "unpublish", "revalidate", "replace"]);

type Body = {
  action?: string;
  candidateId?: unknown;
  slotId?: unknown;
  altText?: unknown;
  caption?: unknown;
  attributionText?: unknown;
  reason?: unknown;
  notes?: unknown;
};

const asId = (v: unknown): string | null =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
const asText = (v: unknown): string => (typeof v === "string" ? v : "");

export async function POST(req: Request) {
  const adminUser = await getAdminUser();
  if (!adminUser) return NextResponse.json({ ok: false }, { status: 404 }); // don't advertise the surface

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!ACTIONS.has(body.action ?? ""))
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  // one candidate per request — arrays and anything non-uuid refuse
  if (Array.isArray(body.candidateId) || Array.isArray(body.slotId))
    return NextResponse.json({ ok: false, error: "One item per request — bulk operations are not supported" }, { status: 400 });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });

  const rpcError = (error: { message: string; code?: string }) => {
    const missing = /function .* does not exist/i.test(error.message);
    return NextResponse.json(
      {
        ok: false,
        error: missing
          ? "Review RPCs unavailable — has migration 0010_photo_review_rpc.sql been applied?"
          : error.message,
      },
      { status: missing ? 503 : 400 }
    );
  };

  /* best-effort but observable — returns what actually happened */
  const revalidateSlot = async (slotId: string, recordPublishEvent: boolean) => {
    const { data: slot, error } = await db
      .from("photo_slots")
      .select("entity_type, entity_slug, status")
      .eq("id", slotId)
      .single();
    if (error || !slot) return { revalidated: false, paths: [] as string[], error: error?.message ?? "slot not found" };
    const paths = pathsForSlot(slot.entity_type, slot.entity_slug);
    try {
      for (const p of paths) revalidatePath(p);
    } catch (e) {
      return { revalidated: false, paths, error: e instanceof Error ? e.message : String(e) };
    }
    if (recordPublishEvent && slot.status === "approved") {
      const { error: evErr } = await db.from("verification_events").insert({
        entity_type: slot.entity_type,
        entity_slug: slot.entity_slug,
        verified_by: adminUser.email,
        verification_method: "admin_review",
        action: "publish",
        notes: `revalidated ${paths.join(", ")}`,
      });
      if (evErr) return { revalidated: true, paths, error: `revalidated but publish event failed: ${evErr.message}` };
    }
    return { revalidated: true, paths, error: null };
  };

  if (body.action === "approve") {
    const candidateId = asId(body.candidateId);
    if (!candidateId) return NextResponse.json({ ok: false, error: "Missing candidateId" }, { status: 400 });
    const { data: assetId, error } = await db.rpc("approve_photo_candidate", {
      p_candidate_id: candidateId,
      p_alt_text: asText(body.altText),
      p_caption: asText(body.caption),
      p_attribution_text: asText(body.attributionText),
      p_admin_email: adminUser.email,
    });
    if (error) return rpcError(error);

    // post-write consistency check (belt + braces on top of the RPC)
    const { data: asset } = await db
      .from("photo_assets")
      .select("photo_slot_id, selected_candidate_id, attribution_text, license")
      .eq("id", assetId)
      .single();
    let consistent = false;
    if (asset) {
      const [{ data: slot }, { data: cand }] = await Promise.all([
        db.from("photo_slots").select("status").eq("id", asset.photo_slot_id).single(),
        db.from("photo_candidates").select("status, license_verified").eq("id", asset.selected_candidate_id).single(),
      ]);
      consistent =
        slot?.status === "approved" &&
        cand?.status === "approved" &&
        cand?.license_verified === true &&
        Boolean(asset.attribution_text) &&
        Boolean(asset.license);
    }

    const slotId = asset?.photo_slot_id ?? null;
    const revalidation = slotId
      ? await revalidateSlot(slotId, true)
      : { revalidated: false, paths: [], error: "slot id unavailable for revalidation" };

    return NextResponse.json({ ok: true, assetId, consistent, ...revalidation });
  }

  /* replace: swap a slot's LIVE asset for a pending manual_upload candidate
     in ONE transaction (0022 RPC) — no unpublish window, no blank card.
     Requires BOTH ids: the RPC cross-checks that the candidate belongs to
     the given slot. Provider-sourced candidates are refused at preflight
     AND inside the RPC — the reviewed unpublish→approve two-step remains
     their only path. */
  if (body.action === "replace") {
    const candidateId = asId(body.candidateId);
    const slotId = asId(body.slotId);
    if (!candidateId || !slotId)
      return NextResponse.json({ ok: false, error: "Missing candidateId or slotId" }, { status: 400 });

    // preflight for precise errors — the RPC re-checks everything under locks
    const [{ data: cand }, { data: liveAsset }] = await Promise.all([
      db
        .from("photo_candidates")
        .select("id, photo_slot_id, source, status, license, raw_api_response")
        .eq("id", candidateId)
        .maybeSingle(),
      db.from("photo_assets").select("id, photo_slot_id, selected_candidate_id").eq("photo_slot_id", slotId).maybeSingle(),
    ]);
    const pre = replacePreflight(cand as ReplaceCandidateRow | null, slotId, liveAsset ?? null, {
      altText: asText(body.altText),
      attributionText: asText(body.attributionText),
    });
    if (!pre.ok) return NextResponse.json({ ok: false, error: pre.reason }, { status: 400 });

    const { data: assetId, error } = await db.rpc("replace_photo_asset", {
      p_candidate_id: candidateId,
      p_slot_id: slotId,
      p_alt_text: asText(body.altText),
      p_caption: asText(body.caption),
      p_attribution_text: asText(body.attributionText),
      p_admin_email: adminUser.email,
    });
    if (error) {
      const missing = /function .* does not exist/i.test(error.message);
      return NextResponse.json(
        {
          ok: false,
          error: missing
            ? "Replace RPC unavailable — has migration 0022_photo_replace.sql been applied?"
            : error.message,
        },
        { status: missing ? 503 : 400 }
      );
    }

    // post-write consistency: new candidate live, old candidate back in the
    // queue, still exactly one asset row for the slot
    const [{ data: after }, { count: assetCount }, { data: newCand }] = await Promise.all([
      db.from("photo_assets").select("photo_slot_id, selected_candidate_id, attribution_text, license").eq("id", assetId).single(),
      db.from("photo_assets").select("id", { count: "exact", head: true }).eq("photo_slot_id", slotId),
      db.from("photo_candidates").select("status, license_verified").eq("id", candidateId).single(),
    ]);
    const consistent =
      after?.photo_slot_id === slotId &&
      after?.selected_candidate_id === candidateId &&
      assetCount === 1 &&
      newCand?.status === "approved" &&
      newCand?.license_verified === true &&
      Boolean(after?.attribution_text) &&
      Boolean(after?.license);

    const revalidation = await revalidateSlot(slotId, true);
    return NextResponse.json({ ok: true, assetId, consistent, ...revalidation });
  }

  if (body.action === "reject") {
    const candidateId = asId(body.candidateId);
    if (!candidateId) return NextResponse.json({ ok: false, error: "Missing candidateId" }, { status: 400 });
    const { error } = await db.rpc("reject_photo_candidate", {
      p_candidate_id: candidateId,
      p_reason: asText(body.reason),
      p_admin_email: adminUser.email,
    });
    if (error) return rpcError(error);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "needs_research") {
    const candidateId = asId(body.candidateId);
    if (!candidateId) return NextResponse.json({ ok: false, error: "Missing candidateId" }, { status: 400 });
    const { error } = await db.rpc("mark_candidate_needs_research", {
      p_candidate_id: candidateId,
      p_notes: asText(body.notes),
      p_admin_email: adminUser.email,
    });
    if (error) return rpcError(error);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "unpublish") {
    const slotId = asId(body.slotId);
    if (!slotId) return NextResponse.json({ ok: false, error: "Missing slotId" }, { status: 400 });
    const { error } = await db.rpc("unpublish_photo_slot", {
      p_slot_id: slotId,
      p_notes: asText(body.notes),
      p_admin_email: adminUser.email,
    });
    if (error) return rpcError(error);
    // revalidate so the placeholder returns; unpublish event already audited by the RPC
    const revalidation = await revalidateSlot(slotId, false);
    return NextResponse.json({ ok: true, ...revalidation });
  }

  // action === "revalidate" — healing action after a failed revalidation;
  // writes the publish event only when the slot is approved and paths succeed
  const slotId = asId(body.slotId);
  if (!slotId) return NextResponse.json({ ok: false, error: "Missing slotId" }, { status: 400 });
  const revalidation = await revalidateSlot(slotId, true);
  return NextResponse.json({ ok: revalidation.revalidated, ...revalidation });
}
