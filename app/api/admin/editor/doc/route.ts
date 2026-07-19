import { NextResponse } from "next/server";
import { editorGate, migrationMissing } from "@/lib/editor/api";
import { regionDef } from "@/lib/editor/registry";

/* Region detail for the desk: current draft + published content and the
   full version history (metadata only — content rides along for the two
   live pointers, history entries load content on rollback preview). */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(req.url);
  const route = url.searchParams.get("route") ?? "";
  const region = url.searchParams.get("region") ?? "";
  const def = regionDef(route, region);
  if (!def) {
    // admin-created pages carry a __layout document without a registry entry
    const isCustomLayout = region === "__layout" && /^\/[a-z0-9-]+$/.test(route);
    if (!isCustomLayout) return NextResponse.json({ ok: false, error: "Unknown region" }, { status: 400 });
    const { data: pg } = await ctx.db.from("editor_pages").select("slug").eq("slug", route.slice(1)).maybeSingle();
    if (!pg) return NextResponse.json({ ok: false, error: "Unknown region" }, { status: 400 });
  }

  const { data: doc, error } = await ctx.db
    .from("editor_documents")
    .select("id, published_version_id, draft_version_id")
    .eq("route", route)
    .eq("region_key", region)
    .maybeSingle();

  if (error) {
    if (migrationMissing(error.message)) return NextResponse.json({ ok: true, migrationApplied: false });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!doc) {
    // never edited: code fallback, base version 0
    return NextResponse.json({ ok: true, migrationApplied: true, doc: null, versions: [], baseVersion: 0 });
  }

  const { data: versions, error: vErr } = await ctx.db
    .from("editor_versions")
    .select("id, version_no, status, content_type, content_json, content_text, seo_title, seo_description, created_by, created_at, published_by, published_at, archived_at")
    .eq("document_id", doc.id)
    .order("version_no", { ascending: false })
    .limit(50);
  if (vErr) return NextResponse.json({ ok: false, error: vErr.message }, { status: 500 });

  const draft = (versions ?? []).find((v) => v.id === doc.draft_version_id) ?? null;
  const published = (versions ?? []).find((v) => v.id === doc.published_version_id) ?? null;
  const baseVersion = draft?.version_no ?? published?.version_no ?? 0;

  return NextResponse.json({
    ok: true,
    migrationApplied: true,
    doc: { id: doc.id },
    draft,
    published,
    baseVersion,
    versions: (versions ?? []).map((v) => ({
      versionNo: v.version_no,
      status: v.status,
      createdBy: v.created_by,
      createdAt: v.created_at,
      publishedBy: v.published_by,
      publishedAt: v.published_at,
      seoTitle: v.seo_title,
      seoDescription: v.seo_description,
      textPreview: (v.content_text ?? "").slice(0, 160),
    })),
  });
}
