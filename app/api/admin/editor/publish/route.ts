import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { editorGate, migrationMissing, migration503, readJsonBody } from "@/lib/editor/api";
import { pageByRoute, regionDef } from "@/lib/editor/registry";
import { sanitizeContent, validateClaims, validateSeo } from "@/lib/editor/doc";
import { editorTag } from "@/lib/editor/overrides";

/* Publish — the ONLY action that changes what public visitors see.
   1. Re-check admin auth (gate).  2. Re-validate the complete stored
   draft server-side (strict: image alt required, claims linter, SEO
   rules).  3. Atomic RPC (row locks, audit event inside the
   transaction).  4. Revalidate the exact public path + override cache
   tag.  Revalidation failure is REPORTED, never hidden — the desk shows
   a warning with the audited heal action. */

export const dynamic = "force-dynamic";

interface Body {
  route: string;
  regionKey: string;
  versionNo: number;
}

export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJsonBody<Body>(req);
  if (body instanceof NextResponse) return body;

  const route = String(body.route ?? "");
  const def = regionDef(route, String(body.regionKey ?? ""));
  const page = pageByRoute(route);
  if (!def || !page) return NextResponse.json({ ok: false, error: "Unknown region" }, { status: 400 });

  // load the stored draft — publish validates what is IN THE STORE, not a
  // client payload
  const { data: doc, error: dErr } = await ctx.db
    .from("editor_documents")
    .select("id, draft_version_id")
    .eq("route", route)
    .eq("region_key", body.regionKey)
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

  // strict publication validation
  const s = sanitizeContent(def.contentType, draft.content_json, {
    allowImages: def.allowImages,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    requireImageAlt: true,
  });
  const errors = [...s.errors, ...validateClaims(s.text)];
  if (def.seoEditable && (draft.seo_title || draft.seo_description)) {
    // exact-duplicate check against every OTHER published override
    const { data: others } = await ctx.db
      .from("editor_versions")
      .select("seo_title, seo_description, document_id, editor_documents!inner(route, region_key, published_version_id)")
      .eq("status", "published")
      .not("seo_title", "is", null);
    const rows = (others ?? []).filter((o) => {
      const d = o.editor_documents as unknown as { route: string; region_key: string };
      return !(d.route === route && d.region_key === body.regionKey);
    });
    errors.push(
      ...validateSeo(draft.seo_title, draft.seo_description, {
        titles: rows.map((o) => o.seo_title ?? "").filter(Boolean),
        descriptions: rows.map((o) => o.seo_description ?? "").filter(Boolean),
      })
    );
  }
  if (errors.length) return NextResponse.json({ ok: false, errors }, { status: 422 });

  const { data, error } = await ctx.db.rpc("editor_publish", {
    p_route: route,
    p_region_key: body.regionKey,
    p_version_no: draft.version_no,
    p_admin_email: ctx.admin.email,
  });
  if (error) {
    if (migrationMissing(error.message)) return migration503();
    const conflict = /version conflict/i.test(error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: conflict ? 409 : 500 });
  }

  // revalidate the exact affected route(s) — failure is reported honestly
  let revalidated = true;
  let revalidateError: string | null = null;
  try {
    revalidateTag(editorTag(route));
    for (const p of page.revalidatePaths) revalidatePath(p);
  } catch (e) {
    revalidated = false;
    revalidateError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    ok: true,
    publishedVersion: data,
    revalidated,
    revalidateError,
    note: revalidated
      ? `v${data} is live on ${route}`
      : `v${data} published, but revalidation FAILED — the public page may serve stale content until you run Heal`,
  });
}
