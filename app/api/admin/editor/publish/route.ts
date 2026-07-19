import { NextResponse } from "next/server";
import { editorGate, migrationMissing, migration503, readJsonBody } from "@/lib/editor/api";
import { pageByRoute, regionDef, sectionsForRoute } from "@/lib/editor/registry";
import { sanitizeContent, validateClaims, validateSeo } from "@/lib/editor/doc";
import { sanitizeLayout, sanitizeNav, editorsPicksFromLayout, TEMPLATE_SECTIONS } from "@/lib/editor/blocks.ts";
import { cities } from "@/lib/dfw-data";
import { revalidateEditorTarget } from "@/lib/editor/revalidate";

/* Publish — the ONLY action that changes what public visitors see.
   1. Re-check admin auth (gate).  2. Re-validate the COMPLETE stored
   draft server-side, strictly (image alt required, claims linter, SEO
   rules; layouts re-checked against their template's required/locked
   sections and H1 rules).  3. Atomic RPC — editor_publish for regions and
   template/static layouts, editor_publish_page for admin-created pages
   (layout + status flip in one transaction).  4. Revalidate exactly the
   affected surfaces.  Shared-template publishes change EVERY page under
   the template and therefore require the typed confirmation
   "PUBLISH TEMPLATE" in the request. Revalidation failure is REPORTED,
   never hidden — the desk shows the audited Heal action. */

export const dynamic = "force-dynamic";

interface Body {
  route: string;
  regionKey: string;
  versionNo: number;
  /** required for template:* routes: the exact string "PUBLISH TEMPLATE" */
  confirmText?: string;
}

export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJsonBody<Body>(req);
  if (body instanceof NextResponse) return body;

  const route = String(body.route ?? "");
  const regionKey = String(body.regionKey ?? "");
  const isLayout = regionKey === "__layout";
  const isNav = regionKey === "nav" && route === "__site";
  const isTemplateRoute = route.startsWith("template:");

  // shared-template guard: an explicit typed confirmation, checked FIRST
  if (isTemplateRoute) {
    if (body.confirmText !== "PUBLISH TEMPLATE") {
      return NextResponse.json(
        { ok: false, error: 'Publishing a shared template changes EVERY page that uses it — type "PUBLISH TEMPLATE" to confirm.' },
        { status: 428 }
      );
    }
  }

  // page/custom resolution
  let customPage: { slug: string; status: string } | null = null;
  if (isLayout && !sectionsForRoute(route)) {
    if (!/^\/[a-z0-9-]+$/.test(route)) return NextResponse.json({ ok: false, error: "Unknown layout target" }, { status: 400 });
    const { data } = await ctx.db.from("editor_pages").select("slug, status").eq("slug", route.slice(1)).maybeSingle();
    if (!data) return NextResponse.json({ ok: false, error: "Unknown page" }, { status: 400 });
    customPage = data;
  } else if (!isLayout && !isNav) {
    const def = regionDef(route, regionKey);
    if (!def || def.contentType === "layout" || def.contentType === "nav") {
      return NextResponse.json({ ok: false, error: "Unknown region" }, { status: 400 });
    }
  }

  // load the stored draft — publish validates what is IN THE STORE
  const { data: doc, error: dErr } = await ctx.db
    .from("editor_documents")
    .select("id, draft_version_id")
    .eq("route", route)
    .eq("region_key", regionKey)
    .maybeSingle();
  if (dErr) {
    if (migrationMissing(dErr.message)) return migration503();
    return NextResponse.json({ ok: false, error: dErr.message }, { status: 500 });
  }
  if (!doc?.draft_version_id) {
    return NextResponse.json({ ok: false, error: "No draft to publish — save a draft first" }, { status: 400 });
  }
  const { data: draft, error: vErr } = await ctx.db
    .from("editor_versions")
    .select("version_no, content_type, content_json, content_text, seo_title, seo_description")
    .eq("id", doc.draft_version_id)
    .single();
  if (vErr || !draft) return NextResponse.json({ ok: false, error: vErr?.message ?? "Draft missing" }, { status: 500 });
  if (draft.version_no !== Number(body.versionNo)) {
    return NextResponse.json(
      { ok: false, error: `Version conflict — the draft is v${draft.version_no}, you asked to publish v${body.versionNo}` },
      { status: 409 }
    );
  }

  /* ---- strict publication validation per family ---- */
  const errors: string[] = [];
  if (isLayout) {
    const sections = sectionsForRoute(route);
    const s = sanitizeLayout(draft.content_json, {
      pageKind: sections ? "template" : "custom",
      sections,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      requireImageAlt: true,
      citySlugs: cities.map((c) => c.slug),
    });
    errors.push(...s.errors, ...validateClaims(s.ok ? s.text : String(draft.content_text ?? "")));
    // Editor's Picks gate: a lineup may DRAFT with missing photos, but it
    // can never PUBLISH until every city has an APPROVED homepage-pick
    // asset — no broken cards, no public placeholders from an override.
    const lineup = s.ok && s.doc ? editorsPicksFromLayout(s.doc) : null;
    if (lineup) {
      const { data: approvedRows } = await ctx.db
        .from("photo_slots")
        .select("entity_slug, photo_assets!inner(id)")
        .eq("entity_type", "homepage")
        .eq("slot_key", "pick")
        .eq("status", "approved")
        .in("entity_slug", lineup.map((p) => p.city));
      const approved = new Set((approvedRows ?? []).map((r) => r.entity_slug as string));
      for (const p of lineup) {
        if (!approved.has(p.city)) {
          errors.push(`"${p.city}" has no APPROVED homepage-pick photo — upload/approve one in the Photo Desk before publishing this lineup`);
        }
      }
    }
  } else if (isNav) {
    const { data: pages } = await ctx.db.from("editor_pages").select("slug").eq("status", "published");
    const s = sanitizeNav(draft.content_json, { publishedPageSlugs: (pages ?? []).map((p) => p.slug) });
    errors.push(...s.errors);
  } else {
    const def = regionDef(route, regionKey)!;
    const s = sanitizeContent(def.contentType, draft.content_json, {
      allowImages: def.allowImages,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      requireImageAlt: true,
    });
    errors.push(...s.errors, ...validateClaims(s.text));
    if (def.seoEditable && (draft.seo_title || draft.seo_description)) {
      const { data: others } = await ctx.db
        .from("editor_versions")
        .select("seo_title, seo_description, editor_documents!inner(route, region_key)")
        .eq("status", "published")
        .not("seo_title", "is", null);
      const rows = (others ?? []).filter((o) => {
        const d = o.editor_documents as unknown as { route: string; region_key: string };
        return !(d.route === route && d.region_key === regionKey);
      });
      errors.push(
        ...validateSeo(draft.seo_title, draft.seo_description, {
          titles: rows.map((o) => o.seo_title ?? "").filter(Boolean),
          descriptions: rows.map((o) => o.seo_description ?? "").filter(Boolean),
        })
      );
    }
  }
  if (errors.length) return NextResponse.json({ ok: false, errors }, { status: 422 });

  /* ---- atomic publish ---- */
  let published: number | null = null;
  if (customPage) {
    const { data, error } = await ctx.db.rpc("editor_publish_page", {
      p_slug: customPage.slug,
      p_version_no: draft.version_no,
      p_admin_email: ctx.admin.email,
    });
    if (error) {
      if (migrationMissing(error.message)) return migration503();
      return NextResponse.json({ ok: false, error: error.message }, { status: /version conflict/i.test(error.message) ? 409 : 500 });
    }
    published = data as number;
  } else {
    const { data, error } = await ctx.db.rpc("editor_publish", {
      p_route: route,
      p_region_key: regionKey,
      p_version_no: draft.version_no,
      p_admin_email: ctx.admin.email,
    });
    if (error) {
      if (migrationMissing(error.message)) return migration503();
      return NextResponse.json({ ok: false, error: error.message }, { status: /version conflict/i.test(error.message) ? 409 : 500 });
    }
    published = data as number;
  }

  const { revalidated, revalidateError } = await revalidateEditorTarget(ctx.db, route);

  return NextResponse.json({
    ok: true,
    publishedVersion: published,
    revalidated,
    revalidateError,
    note: revalidated
      ? isTemplateRoute
        ? `v${published} is live on EVERY page using this template`
        : `v${published} is live on ${route === "__site" ? "the site navigation" : route}`
      : `v${published} published, but revalidation FAILED — the public page may serve stale content until you run Heal`,
  });
}
