import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/db/admin";
import {
  buildSeoCorpus,
  lintContentDraft,
  findPage,
  type ContentDraft,
  type LintResult,
} from "@/lib/content/community-content-drafts";

/* CB-3a SEO Community Editor actions. Admin-only (ADMIN_EMAILS gate before
   anything is read; 404 to everyone else). One draft, one action, one
   request. Content drafts never publish from here: the only route to a
   page is the CB-2 exporter's --content mode writing lib/hood-content.json
   on a reviewed branch. Every mutation writes a verification_events audit
   row. The ready toggle re-lints SERVER-SIDE and refuses on errors — the
   portal's lint panel is advisory, this check is not. */

export const runtime = "nodejs";

type Body = {
  action?: string;
  draftId?: string;
  citySlug?: string;
  hoodSlug?: string;
  fields?: Partial<
    Pick<ContentDraft, "seoTitle" | "seoDescription" | "tagline" | "intro" | "homesCopy" | "highlights" | "faq" | "newBuild" | "links" | "mlsSnapshot">
  >;
  readyForExport?: boolean;
  notes?: string;
};

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

const str = (v: unknown, max: number) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

/** Coerce client fields into a row patch (bounded, typed). */
function toRowPatch(f: NonNullable<Body["fields"]>): Record<string, unknown> | string {
  const patch: Record<string, unknown> = {};
  if ("seoTitle" in f) patch.seo_title = str(f.seoTitle, 120);
  if ("seoDescription" in f) patch.seo_description = str(f.seoDescription, 300);
  if ("tagline" in f) patch.tagline = str(f.tagline, 120);
  if ("homesCopy" in f) patch.homes_copy = str(f.homesCopy, 1200);
  if ("intro" in f) {
    if (!Array.isArray(f.intro)) return "intro must be an array of paragraphs";
    patch.intro_json = f.intro.map((p) => String(p).trim()).filter(Boolean).slice(0, 8);
  }
  if ("highlights" in f) {
    if (!Array.isArray(f.highlights)) return "highlights must be an array";
    patch.highlights_json = f.highlights
      .map((h) => ({ title: String(h?.title ?? "").trim().slice(0, 80), note: String(h?.note ?? "").trim().slice(0, 300) }))
      .filter((h) => h.title || h.note)
      .slice(0, 8);
  }
  if ("faq" in f) {
    if (!Array.isArray(f.faq)) return "faq must be an array";
    patch.faq_json = f.faq
      .map((x) => ({ q: String(x?.q ?? "").trim().slice(0, 200), a: String(x?.a ?? "").trim().slice(0, 800) }))
      .filter((x) => x.q || x.a)
      .slice(0, 10);
  }
  if ("newBuild" in f) {
    patch.newbuild_json = f.newBuild
      ? {
          amenities: (f.newBuild.amenities ?? []).map((s) => String(s).trim().slice(0, 200)).filter(Boolean).slice(0, 10),
          buyerNotes: (f.newBuild.buyerNotes ?? []).map((s) => String(s).trim().slice(0, 400)).filter(Boolean).slice(0, 6),
        }
      : null;
  }
  if ("links" in f) {
    if (!Array.isArray(f.links)) return "links must be an array";
    const links = f.links
      .map((l) => ({ label: String(l?.label ?? "").trim().slice(0, 80), href: String(l?.href ?? "").trim().slice(0, 200) }))
      .filter((l) => l.label && l.href)
      .slice(0, 10);
    // internal targets only — stored now, rendered in CB-3b
    for (const l of links) if (!l.href.startsWith("/")) return `link "${l.label}" must be an internal path starting with /`;
    patch.links_json = links;
  }
  if ("mlsSnapshot" in f) {
    if (f.mlsSnapshot && JSON.stringify(f.mlsSnapshot).length > 16 * 1024) return "mlsSnapshot too large";
    patch.mls_snapshot_json = f.mlsSnapshot ?? null;
  }
  return patch;
}

function draftShape(row: Record<string, unknown>) {
  return {
    citySlug: String(row.city_slug),
    hoodSlug: String(row.hood_slug),
    seoTitle: (row.seo_title as string) ?? null,
    seoDescription: (row.seo_description as string) ?? null,
    tagline: (row.tagline as string) ?? null,
    intro: (row.intro_json as string[]) ?? [],
    homesCopy: (row.homes_copy as string) ?? null,
    highlights: (row.highlights_json as { title: string; note: string }[]) ?? [],
    faq: (row.faq_json as { q: string; a: string }[]) ?? [],
    newBuild: (row.newbuild_json as { amenities: string[]; buyerNotes: string[] } | null) ?? null,
  };
}

export async function POST(req: Request) {
  const adminUser = await getAdminUser();
  if (!adminUser) return NextResponse.json({ ok: false }, { status: 404 }); // don't advertise the surface

  const db = getSupabaseAdmin();
  if (!db) return bad("Not configured", 503);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("Expected JSON body");
  }

  async function audit(action: "create" | "update" | "archive", citySlug: string, hoodSlug: string, notes: string | null) {
    const { error } = await db!.from("verification_events").insert({
      entity_type: "community_content_draft",
      entity_slug: `${citySlug}/${hoodSlug}`,
      verified_by: adminUser!.email,
      verification_method: "admin_review",
      action,
      notes,
    });
    return error?.message ?? null;
  }

  async function otherDraftsFor(excludeId: string | null) {
    const { data } = await db!
      .from("community_content_drafts")
      .select("id, city_slug, hood_slug, seo_title, seo_description")
      .neq("lifecycle", "archived");
    return (data ?? [])
      .filter((r) => r.id !== excludeId)
      .map((r) => ({ citySlug: r.city_slug, hoodSlug: r.hood_slug, seoTitle: r.seo_title, seoDescription: r.seo_description }));
  }

  /* ---- lint (read-only; works on posted fields, draft need not exist) ---- */
  if (body.action === "lint") {
    const citySlug = String(body.citySlug ?? "");
    const hoodSlug = String(body.hoodSlug ?? "");
    const patch = toRowPatch(body.fields ?? {});
    if (typeof patch === "string") return bad(patch);
    const others = await otherDraftsFor(body.draftId ?? null).catch(() => []);
    const lint = lintContentDraft(
      { ...draftShape({ ...patch, city_slug: citySlug, hood_slug: hoodSlug }) },
      buildSeoCorpus(others),
      body.readyForExport === true // lint at export strictness when asked
    );
    return NextResponse.json({ ok: true, lint });
  }

  /* ---- save (create or update by page key) ---- */
  if (body.action === "save") {
    const citySlug = String(body.citySlug ?? "");
    const hoodSlug = String(body.hoodSlug ?? "");
    if (!findPage(citySlug, hoodSlug)) return bad(`${citySlug}/${hoodSlug} is not an existing page — content attaches only to live pages`, 409);
    const patch = toRowPatch(body.fields ?? {});
    if (typeof patch === "string") return bad(patch);

    const { data: existing, error: exErr } = await db
      .from("community_content_drafts")
      .select("id, lifecycle")
      .eq("city_slug", citySlug)
      .eq("hood_slug", hoodSlug)
      .neq("lifecycle", "archived")
      .maybeSingle();
    if (exErr) {
      const missing = /relation .* does not exist|schema cache/i.test(exErr.message);
      return bad(missing ? "community_content_drafts missing — has migration 0013 been applied?" : exErr.message, missing ? 503 : 500);
    }

    let draftId: string;
    let lint: LintResult | null = null;
    if (existing) {
      if (existing.lifecycle !== "draft" && existing.lifecycle !== "ready")
        return bad(`Content for this page is ${existing.lifecycle} — exported/live content changes via a new export cycle, not here`, 409);
      // any edit drops readiness until re-linted + re-toggled
      const { error } = await db
        .from("community_content_drafts")
        .update({ ...patch, ready_for_export: false, lifecycle: "draft" })
        .eq("id", existing.id);
      if (error) return bad(error.message, 500);
      draftId = existing.id;
    } else {
      const { data: created, error } = await db
        .from("community_content_drafts")
        .insert({ ...patch, city_slug: citySlug, hood_slug: hoodSlug, lifecycle: "draft", ready_for_export: false, created_by: adminUser.email })
        .select("id")
        .single();
      if (error) {
        const missing = /relation .* does not exist|schema cache/i.test(error.message);
        return bad(missing ? "community_content_drafts missing — has migration 0013 been applied?" : error.message, missing ? 503 : 500);
      }
      draftId = created.id;
    }
    const auditErr = await audit(existing ? "update" : "create", citySlug, hoodSlug, null);
    return NextResponse.json({ ok: true, draftId, lint, auditError: auditErr });
  }

  /* ---- everything else needs an existing draft ---- */
  const draftId = String(body.draftId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) return bad("Missing draftId");
  const { data: row, error: getErr } = await db.from("community_content_drafts").select("*").eq("id", draftId).single();
  if (getErr || !row) return bad("Draft not found", 404);

  if (body.action === "ready") {
    if (row.lifecycle !== "draft" && row.lifecycle !== "ready") return bad(`Draft is ${row.lifecycle}`, 409);
    const wantReady = body.readyForExport === true;
    if (wantReady) {
      // server-side lint at EXPORT strictness — the panel is advisory, this is not
      const others = await otherDraftsFor(draftId);
      const lint = lintContentDraft(draftShape(row), buildSeoCorpus(others), true);
      if (lint.errors.length) {
        await db.from("community_content_drafts").update({ lint_json: lint }).eq("id", draftId);
        return NextResponse.json({ ok: false, error: `lint blocks readiness: ${lint.errors.length} error(s)`, lint }, { status: 422 });
      }
      const { error } = await db
        .from("community_content_drafts")
        .update({ ready_for_export: true, lifecycle: "ready", lint_json: lint })
        .eq("id", draftId);
      if (error) return bad(error.message, 500);
      const auditErr = await audit("update", row.city_slug, row.hood_slug, "ready_for_export=true (lint clean)");
      return NextResponse.json({ ok: true, lint, auditError: auditErr });
    }
    const { error } = await db.from("community_content_drafts").update({ ready_for_export: false, lifecycle: "draft" }).eq("id", draftId);
    if (error) return bad(error.message, 500);
    const auditErr = await audit("update", row.city_slug, row.hood_slug, "ready_for_export=false");
    return NextResponse.json({ ok: true, auditError: auditErr });
  }

  if (body.action === "archive") {
    if (row.lifecycle === "live")
      return bad("This content is live — remove it from hood-content.json via a revert/export first, then archive", 409);
    const { error } = await db
      .from("community_content_drafts")
      .update({ lifecycle: "archived", ready_for_export: false, archived_at: new Date().toISOString() })
      .eq("id", draftId);
    if (error) return bad(error.message, 500);
    const auditErr = await audit("archive", row.city_slug, row.hood_slug, String(body.notes ?? "").trim() || null);
    return NextResponse.json({ ok: true, auditError: auditErr });
  }

  return bad(`Unknown action "${body.action}"`);
}
