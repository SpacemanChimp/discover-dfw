import { NextResponse } from "next/server";
import { editorGate, migrationMissing, migration503, readJsonBody } from "@/lib/editor/api";
import { regionDef, sectionsForRoute } from "@/lib/editor/registry";
import { sanitizeContent } from "@/lib/editor/doc";
import { sanitizeLayout, sanitizeNav, TEMPLATE_SECTIONS } from "@/lib/editor/blocks.ts";
import { cities } from "@/lib/dfw-data";
import type { EditorCtx } from "@/lib/editor/api";

/* Save Draft — the explicit durable action (client debounce is advisory
   only). Three document families share the same versioned store + RPC:
     richtext/text/faq  → 0018 content regions (registry-gated)
     layout             → Visual Builder page layouts (static pages,
                          shared templates, admin-created pages)
     nav                → the site navigation document
   Server-side sanitation is the contract in every case: the stored JSON is
   the sanitizer's output, never the client's raw document. */

export const dynamic = "force-dynamic";

interface Body {
  route: string;
  regionKey: string;
  content: unknown;
  seoTitle?: string;
  seoDescription?: string;
  baseVersion: number;
}

async function customPageExists(ctx: EditorCtx, route: string): Promise<boolean> {
  if (!/^\/[a-z0-9-]+$/.test(route)) return false;
  const { data } = await ctx.db.from("editor_pages").select("slug").eq("slug", route.slice(1)).maybeSingle();
  return !!data;
}

export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJsonBody<Body>(req);
  if (body instanceof NextResponse) return body;

  const route = String(body.route ?? "");
  const regionKey = String(body.regionKey ?? "");

  let contentType: "richtext" | "text" | "faq" | "layout" | "nav";
  let doc: unknown;
  let text: string;
  let seoTitle: string | null = null;
  let seoDescription: string | null = null;

  if (regionKey === "__layout") {
    // Visual Builder layout: template sections when the route is a code
    // template; block-only custom pages otherwise
    const sections = sectionsForRoute(route);
    let pageKind: "custom" | "template";
    if (sections) pageKind = "template";
    else if (await customPageExists(ctx, route)) pageKind = "custom";
    else return NextResponse.json({ ok: false, error: "Unknown layout target" }, { status: 400 });

    const s = sanitizeLayout(body.content, {
      pageKind,
      sections,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      requireImageAlt: false,
      citySlugs: cities.map((c) => c.slug),
    });
    if (!s.ok) return NextResponse.json({ ok: false, errors: s.errors }, { status: 422 });
    contentType = "layout";
    doc = s.doc;
    text = s.text;
  } else if (regionKey === "nav" && route === "__site") {
    const { data: pages } = await ctx.db.from("editor_pages").select("slug").eq("status", "published");
    const s = sanitizeNav(body.content, { publishedPageSlugs: (pages ?? []).map((p) => p.slug) });
    if (!s.ok) return NextResponse.json({ ok: false, errors: s.errors }, { status: 422 });
    contentType = "nav";
    doc = s.doc;
    text = s.text;
  } else {
    const def = regionDef(route, regionKey);
    if (!def || def.contentType === "layout" || def.contentType === "nav") {
      return NextResponse.json({ ok: false, error: "Unknown region" }, { status: 400 });
    }
    const s = sanitizeContent(def.contentType, body.content, {
      allowImages: def.allowImages,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      requireImageAlt: false,
    });
    if (!s.ok) return NextResponse.json({ ok: false, errors: s.errors }, { status: 422 });
    contentType = def.contentType;
    doc = s.doc;
    text = s.text;
    seoTitle = def.seoEditable ? String(body.seoTitle ?? "").slice(0, 200) : null;
    seoDescription = def.seoEditable ? String(body.seoDescription ?? "").slice(0, 400) : null;
  }

  const { data, error } = await ctx.db.rpc("editor_save_draft", {
    p_route: route,
    p_region_key: regionKey,
    p_content_type: contentType,
    p_content_json: doc,
    p_content_text: text,
    p_seo_title: seoTitle,
    p_seo_description: seoDescription,
    p_base_version: Number(body.baseVersion ?? -1),
    p_admin_email: ctx.admin.email,
  });

  if (error) {
    if (migrationMissing(error.message)) return migration503();
    // 0019 not applied yet → the layout/nav content_type check fails loudly
    if (/content_type/i.test(error.message) && (contentType === "layout" || contentType === "nav")) {
      return NextResponse.json(
        { ok: false, migrationApplied: false, error: "Visual Builder storage needs migration 0019_visual_builder.sql" },
        { status: 503 }
      );
    }
    const conflict = /version conflict/i.test(error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: conflict ? 409 : 500 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, versionNo: row?.version_no ?? null });
}
