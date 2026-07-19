import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { editorGate, migrationMissing, migration503, readJsonBody } from "@/lib/editor/api";
import { pageByRoute, regionDef } from "@/lib/editor/registry";
import { editorTag } from "@/lib/editor/overrides";

/* Roll Back — republish an earlier version's content as a NEW version
   (append-only history), then revalidate. Atomic in the RPC. */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJsonBody<{ route: string; regionKey: string; targetVersionNo: number }>(req);
  if (body instanceof NextResponse) return body;

  const route = String(body.route ?? "");
  const def = regionDef(route, String(body.regionKey ?? ""));
  const page = pageByRoute(route);
  if (!def || !page) return NextResponse.json({ ok: false, error: "Unknown region" }, { status: 400 });

  const { data, error } = await ctx.db.rpc("editor_rollback", {
    p_route: route,
    p_region_key: body.regionKey,
    p_target_version_no: Number(body.targetVersionNo),
    p_admin_email: ctx.admin.email,
  });
  if (error) {
    if (migrationMissing(error.message)) return migration503();
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let revalidated = true;
  let revalidateError: string | null = null;
  try {
    revalidateTag(editorTag(route));
    for (const p of page.revalidatePaths) revalidatePath(p);
  } catch (e) {
    revalidated = false;
    revalidateError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ ok: true, publishedVersion: data, revalidated, revalidateError });
}
