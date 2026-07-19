import { NextResponse } from "next/server";
import { editorGate, migrationMissing, migration503, readJsonBody } from "@/lib/editor/api";
import { regionDef } from "@/lib/editor/registry";

/* Archive Draft — parks the working draft (atomic RPC + audit). Nothing
   public changes; no revalidation needed. */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJsonBody<{ route: string; regionKey: string }>(req);
  if (body instanceof NextResponse) return body;

  const def = regionDef(String(body.route ?? ""), String(body.regionKey ?? ""));
  if (!def) return NextResponse.json({ ok: false, error: "Unknown region" }, { status: 400 });

  const { error } = await ctx.db.rpc("editor_archive_draft", {
    p_route: body.route,
    p_region_key: body.regionKey,
    p_admin_email: ctx.admin.email,
  });
  if (error) {
    if (migrationMissing(error.message)) return migration503();
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
