import { NextResponse } from "next/server";
import { editorGate, migrationMissing, migration503, readJsonBody } from "@/lib/editor/api";
import { allPages } from "@/lib/editor/registry";
import { starterLayout, validateSlug, RESERVED_SLUGS } from "@/lib/editor/blocks.ts";
import { validateSeo } from "@/lib/editor/doc";
import { revalidateEditorTarget } from "@/lib/editor/revalidate";

/* Admin-created pages (the New Page flow + Page Settings).

   GET    → list every builder page with status + layout version pointers
   POST   → { action:"create", slug, title, template }  — new DRAFT page:
              404/noindex for anonymous visitors, out of sitemap + nav,
              starter layout saved as draft v1. Slug collisions validated
              against reserved slugs, every registry route, and existing
              pages.
            { action:"update", slug, …settings } — page settings (SEO,
              nav label/visibility, header/footer). Canonical stays
              generated + read-only.
            { action:"unpublish", slug } — atomic RPC back to draft.
   Every write is audited. Deleting pages is deliberately absent —
   unpublish + history covers the need without destroying evidence. */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;
  const { data, error } = await ctx.db
    .from("editor_pages")
    .select("slug, title, template, status, seo_title, seo_description, og_image_url, nav_label, show_in_nav, header_footer, created_by, created_at, published_at")
    .order("created_at", { ascending: false });
  if (error) {
    if (migrationMissing(error.message)) return NextResponse.json({ ok: true, migrationApplied: false, pages: [] });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, migrationApplied: true, pages: data ?? [] });
}

interface Body {
  action: "create" | "update" | "unpublish";
  slug: string;
  title?: string;
  template?: string;
  seoTitle?: string;
  seoDescription?: string;
  ogImageUrl?: string;
  navLabel?: string;
  showInNav?: boolean;
  headerFooter?: boolean;
}

const TEMPLATES = new Set(["blank", "landing", "buyer-guide", "seller-guide", "about-team", "contact", "listings-landing"]);

export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = await readJsonBody<Body>(req);
  if (body instanceof NextResponse) return body;

  const slug = String(body.slug ?? "").toLowerCase().trim();

  if (body.action === "create") {
    const template = TEMPLATES.has(String(body.template)) ? String(body.template) : "blank";
    const title = String(body.title ?? "").trim().slice(0, 120);
    if (!title) return NextResponse.json({ ok: false, error: "A page name is required" }, { status: 400 });

    // collisions: reserved + every registry route's first segment + pages
    const taken = new Set<string>();
    for (const p of allPages()) {
      const seg = p.route.split("/").filter(Boolean)[0];
      if (seg) taken.add(seg);
    }
    const { data: existing, error: exErr } = await ctx.db.from("editor_pages").select("slug");
    if (exErr) {
      if (migrationMissing(exErr.message)) return migration503();
      return NextResponse.json({ ok: false, error: exErr.message }, { status: 500 });
    }
    for (const p of existing ?? []) taken.add(p.slug);
    const slugErrors = validateSlug(slug, [...taken]);
    if (slugErrors.length) return NextResponse.json({ ok: false, errors: slugErrors }, { status: 422 });

    const { error: insErr } = await ctx.db.from("editor_pages").insert({
      slug,
      title,
      template,
      status: "draft",
      created_by: ctx.admin.email,
    });
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });

    // starter layout as draft v1 (same RPC path as every other draft)
    let n = 0;
    const uid = () => `blk-${Date.now().toString(36)}-${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const layout = starterLayout(template, uid);
    const { error: draftErr } = await ctx.db.rpc("editor_save_draft", {
      p_route: `/${slug}`,
      p_region_key: "__layout",
      p_content_type: "layout",
      p_content_json: layout,
      p_content_text: `starter layout · ${template}`,
      p_seo_title: null,
      p_seo_description: null,
      p_base_version: 0,
      p_admin_email: ctx.admin.email,
    });
    if (draftErr) return NextResponse.json({ ok: false, error: draftErr.message }, { status: 500 });

    await ctx.db.from("verification_events").insert({
      entity_type: "editor_page",
      entity_slug: slug,
      verified_by: ctx.admin.email,
      verification_method: "admin_review",
      action: "create",
      notes: `page created (${template} template) — DRAFT: 404/noindex, out of sitemap + nav`,
    });
    return NextResponse.json({ ok: true, slug });
  }

  if (body.action === "update") {
    if (RESERVED_SLUGS.has(slug)) return NextResponse.json({ ok: false, error: "Unknown page" }, { status: 400 });
    const { data: page, error: pErr } = await ctx.db.from("editor_pages").select("slug, status").eq("slug", slug).maybeSingle();
    if (pErr || !page) return NextResponse.json({ ok: false, error: "Unknown page" }, { status: 404 });

    const seoTitle = String(body.seoTitle ?? "").trim().slice(0, 200) || null;
    const seoDescription = String(body.seoDescription ?? "").trim().slice(0, 400) || null;
    const ogImageUrl = String(body.ogImageUrl ?? "").trim();
    if (ogImageUrl && !/^\/images\//.test(ogImageUrl) && !ogImageUrl.startsWith((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "") + "/storage/v1/object/public/editorial-photos/")) {
      return NextResponse.json({ ok: false, error: "Social image must come from the editorial-photos bucket or /images" }, { status: 422 });
    }
    if (page.status === "published" && (seoTitle || seoDescription)) {
      const seoErrors = validateSeo(seoTitle, seoDescription, { titles: [], descriptions: [] });
      if (seoErrors.length) return NextResponse.json({ ok: false, errors: seoErrors }, { status: 422 });
    }

    const { error: upErr } = await ctx.db
      .from("editor_pages")
      .update({
        title: String(body.title ?? "").trim().slice(0, 120) || undefined,
        seo_title: seoTitle,
        seo_description: seoDescription,
        og_image_url: ogImageUrl || null,
        nav_label: String(body.navLabel ?? "").trim().slice(0, 24) || null,
        show_in_nav: body.showInNav === true,
        header_footer: body.headerFooter !== false,
      })
      .eq("slug", slug);
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    await ctx.db.from("verification_events").insert({
      entity_type: "editor_page",
      entity_slug: slug,
      verified_by: ctx.admin.email,
      verification_method: "admin_review",
      action: "update",
      notes: "page settings updated",
    });
    const { revalidated, revalidateError } = page.status === "published" ? await revalidateEditorTarget(ctx.db, `/${slug}`) : { revalidated: true, revalidateError: null };
    return NextResponse.json({ ok: true, revalidated, revalidateError });
  }

  if (body.action === "unpublish") {
    const { error } = await ctx.db.rpc("editor_unpublish_page", { p_slug: slug, p_admin_email: ctx.admin.email });
    if (error) {
      if (migrationMissing(error.message)) return migration503();
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const { revalidated, revalidateError } = await revalidateEditorTarget(ctx.db, `/${slug}`);
    return NextResponse.json({ ok: true, revalidated, revalidateError });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
