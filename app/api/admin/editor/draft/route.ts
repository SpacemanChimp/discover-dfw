import { NextResponse } from "next/server";
import { editorGate, migrationMissing, migration503, readJsonBody } from "@/lib/editor/api";
import { regionDef } from "@/lib/editor/registry";
import { sanitizeContent } from "@/lib/editor/doc";

/* Save Draft — the explicit durable action (client debounce is advisory
   only). Server-side sanitation is the contract: the stored JSON is the
   sanitizer's output, never the client's raw document. Draft saves accept
   images without alt (publication is where alt becomes mandatory) so an
   admin can save work-in-progress; every other rule enforces now. */

export const dynamic = "force-dynamic";

interface Body {
  route: string;
  regionKey: string;
  content: unknown;
  seoTitle?: string;
  seoDescription?: string;
  baseVersion: number;
}

export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJsonBody<Body>(req);
  if (body instanceof NextResponse) return body;

  const def = regionDef(String(body.route ?? ""), String(body.regionKey ?? ""));
  if (!def) return NextResponse.json({ ok: false, error: "Unknown region" }, { status: 400 });

  const s = sanitizeContent(def.contentType, body.content, {
    allowImages: def.allowImages,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    requireImageAlt: false,
  });
  if (!s.ok) return NextResponse.json({ ok: false, errors: s.errors }, { status: 422 });

  const seoTitle = def.seoEditable ? String(body.seoTitle ?? "").slice(0, 200) : null;
  const seoDescription = def.seoEditable ? String(body.seoDescription ?? "").slice(0, 400) : null;

  const { data, error } = await ctx.db.rpc("editor_save_draft", {
    p_route: body.route,
    p_region_key: body.regionKey,
    p_content_type: def.contentType,
    p_content_json: s.doc,
    p_content_text: s.text,
    p_seo_title: seoTitle,
    p_seo_description: seoDescription,
    p_base_version: Number(body.baseVersion ?? -1),
    p_admin_email: ctx.admin.email,
  });

  if (error) {
    if (migrationMissing(error.message)) return migration503();
    const conflict = /version conflict/i.test(error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: conflict ? 409 : 500 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, versionNo: row?.version_no ?? null });
}
