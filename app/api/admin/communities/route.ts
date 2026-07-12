import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/db/admin";
import {
  DRAFT_STATUS_LABELS,
  findDatasetCollision,
  collisionMessage,
  type DraftStatusLabel,
} from "@/lib/content/community-drafts";
import { slugifyHood } from "@/lib/slug";

/* CB-1 Community Builder actions. Admin-only (ADMIN_EMAILS gate before
   anything is read; 404 to everyone else). One draft, one action, one
   request — no bulk anything. Drafts never publish from here: the only
   route to a public page is the separately-gated CB-2 exporter writing
   lib/dfw.data.json on a reviewed branch. Every action writes a
   verification_events audit row (requires migration 0012's extended
   action constraint). */

export const runtime = "nodejs";

const NOTE_MAX = 200;
const NAME_MAX = 80;
const LABEL_MAX = 40;
const SNAPSHOT_MAX_BYTES = 16 * 1024;

type Fields = {
  type?: unknown;
  name?: unknown;
  citySlug?: unknown;
  slug?: unknown;
  statusLabel?: unknown;
  fromLabel?: unknown;
  buildersCount?: unknown;
  buildersLabel?: unknown;
  note?: unknown;
  readyForExport?: unknown;
  mlsSnapshot?: unknown;
};

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Validate + coerce form fields into a row patch. Returns an error string
    or the patch. `full` = create (all requireds enforced). */
function buildPatch(f: Fields, full: boolean): string | Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (full || f.type !== undefined) {
    if (f.type !== "hood" && f.type !== "new_build") return "type must be 'hood' or 'new_build'";
    patch.type = f.type;
  }
  if (full || f.name !== undefined) {
    const name = String(f.name ?? "").trim();
    if (!name || name.length > NAME_MAX) return `name is required (max ${NAME_MAX} chars)`;
    patch.name = name;
  }
  if (full || f.citySlug !== undefined) {
    patch.city_slug = String(f.citySlug ?? "").trim();
  }
  if (full || f.slug !== undefined || f.name !== undefined) {
    // explicit slug wins; otherwise derive from the (possibly updated) name
    const explicit = String(f.slug ?? "").trim();
    patch.slug = explicit || slugifyHood(String(f.name ?? "").trim());
  }
  if (f.statusLabel !== undefined) {
    const v = String(f.statusLabel ?? "").trim();
    if (v && !DRAFT_STATUS_LABELS.includes(v as DraftStatusLabel))
      return `statusLabel must be one of: ${DRAFT_STATUS_LABELS.join(", ")}`;
    patch.status_label = v || null;
  }
  if (f.fromLabel !== undefined) {
    const v = String(f.fromLabel ?? "").trim();
    if (v && !/^\$\d{2,4}(s|K|\.\dM)$/.test(v)) return 'fromLabel must look like "$230s", "$1.2M" or "$450K"';
    if (v.length > LABEL_MAX) return `fromLabel max ${LABEL_MAX} chars`;
    patch.from_label = v || null;
  }
  if (f.buildersCount !== undefined) {
    if (f.buildersCount === null || f.buildersCount === "") patch.builders_count = null;
    else {
      const n = Number(f.buildersCount);
      if (!Number.isInteger(n) || n < 0 || n > 99) return "buildersCount must be an integer 0–99";
      patch.builders_count = n;
    }
  }
  if (f.buildersLabel !== undefined) {
    const v = String(f.buildersLabel ?? "").trim();
    if (v.length > LABEL_MAX) return `buildersLabel max ${LABEL_MAX} chars`;
    patch.builders_label = v || null;
  }
  if (f.note !== undefined) {
    const v = String(f.note ?? "").trim();
    if (v.length > NOTE_MAX) return `note max ${NOTE_MAX} chars`;
    patch.note = v || null;
  }
  if (f.mlsSnapshot !== undefined && f.mlsSnapshot !== null) {
    if (typeof f.mlsSnapshot !== "object") return "mlsSnapshot must be an object";
    if (JSON.stringify(f.mlsSnapshot).length > SNAPSHOT_MAX_BYTES) return "mlsSnapshot too large";
    patch.mls_snapshot_json = f.mlsSnapshot;
  }

  // defaults & type coherence
  const type = patch.type;
  if (type === "hood") {
    patch.status_label = null; // hood entries have no selling status
  } else if (full && type === "new_build" && !patch.status_label) {
    patch.status_label = "NOW SELLING"; // the approved default
  }
  return patch;
}

async function audit(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  action: "create" | "update" | "archive",
  citySlug: string,
  slug: string,
  email: string,
  notes: string | null
) {
  // best-effort: an audit insert failure is surfaced, never swallowed
  const { error } = await db.from("verification_events").insert({
    entity_type: "community_draft",
    entity_slug: `${citySlug}/${slug}`,
    verified_by: email,
    verification_method: "admin_review",
    action,
    notes,
  });
  return error?.message ?? null;
}

export async function POST(req: Request) {
  const adminUser = await getAdminUser();
  if (!adminUser) return NextResponse.json({ ok: false }, { status: 404 }); // don't advertise the surface

  const db = getSupabaseAdmin();
  if (!db) return bad("Not configured", 503);

  let body: { action?: string; draftId?: string; notes?: string } & Fields;
  try {
    body = await req.json();
  } catch {
    return bad("Expected JSON body");
  }

  /* ---- create ---- */
  if (body.action === "create") {
    const patch = buildPatch(body, true);
    if (typeof patch === "string") return bad(patch);
    const citySlug = String(patch.city_slug);
    const slug = String(patch.slug);

    const collision = findDatasetCollision(citySlug, slug);
    if (collision) return bad(collisionMessage(collision, citySlug, slug), 409);

    const { data: dup } = await db
      .from("community_drafts")
      .select("id")
      .eq("city_slug", citySlug)
      .eq("slug", slug)
      .neq("lifecycle", "archived")
      .limit(1);
    if (dup?.length) return bad(`A non-archived draft for "${citySlug}/${slug}" already exists`, 409);

    const { data: created, error } = await db
      .from("community_drafts")
      .insert({ ...patch, lifecycle: "draft", ready_for_export: false, created_by: adminUser.email })
      .select("id")
      .single();
    if (error) {
      const missing = /relation .* does not exist/i.test(error.message);
      return bad(missing ? "community_drafts table missing — has migration 0012 been applied?" : error.message, missing ? 503 : 500);
    }
    const auditErr = await audit(db, "create", citySlug, slug, adminUser.email, null);
    return NextResponse.json({ ok: true, draftId: created.id, auditError: auditErr });
  }

  /* ---- everything else needs an existing draft ---- */
  const draftId = String(body.draftId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) return bad("Missing draftId");
  const { data: draft, error: getErr } = await db
    .from("community_drafts")
    .select("id, type, name, city_slug, slug, lifecycle, ready_for_export")
    .eq("id", draftId)
    .single();
  if (getErr || !draft) return bad("Draft not found", 404);

  if (body.action === "update") {
    if (draft.lifecycle !== "draft" && draft.lifecycle !== "ready")
      return bad(`Draft is ${draft.lifecycle} — exported/live entries change via the exporter/PR flow, not here`, 409);

    const patch = buildPatch(body, false);
    if (typeof patch === "string") return bad(patch);

    const citySlug = String(patch.city_slug ?? draft.city_slug);
    const slug = String(patch.slug ?? draft.slug);
    if (citySlug !== draft.city_slug || slug !== draft.slug) {
      const collision = findDatasetCollision(citySlug, slug);
      if (collision) return bad(collisionMessage(collision, citySlug, slug), 409);
      const { data: dup } = await db
        .from("community_drafts")
        .select("id")
        .eq("city_slug", citySlug)
        .eq("slug", slug)
        .neq("lifecycle", "archived")
        .neq("id", draftId)
        .limit(1);
      if (dup?.length) return bad(`A non-archived draft for "${citySlug}/${slug}" already exists`, 409);
    }

    if (body.readyForExport !== undefined) {
      patch.ready_for_export = body.readyForExport === true;
      patch.lifecycle = patch.ready_for_export ? "ready" : "draft";
    }

    const { error } = await db.from("community_drafts").update(patch).eq("id", draftId);
    if (error) return bad(error.message, 500);
    const auditErr = await audit(db, "update", citySlug, slug, adminUser.email, body.readyForExport !== undefined ? `ready_for_export=${patch.ready_for_export}` : null);
    return NextResponse.json({ ok: true, auditError: auditErr });
  }

  if (body.action === "archive") {
    if (draft.lifecycle === "live")
      return bad("This entry is live — remove it from dfw.data.json via git revert first, then archive the draft", 409);
    const { error } = await db
      .from("community_drafts")
      .update({ lifecycle: "archived", ready_for_export: false, archived_at: new Date().toISOString() })
      .eq("id", draftId);
    if (error) return bad(error.message, 500);
    const auditErr = await audit(db, "archive", draft.city_slug, draft.slug, adminUser.email, String(body.notes ?? "").trim() || null);
    return NextResponse.json({ ok: true, auditError: auditErr });
  }

  return bad(`Unknown action "${body.action}"`);
}
