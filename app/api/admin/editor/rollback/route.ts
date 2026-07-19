import { NextResponse } from "next/server";
import { editorGate, migrationMissing, migration503, readJsonBody } from "@/lib/editor/api";
import { regionDef, sectionsForRoute } from "@/lib/editor/registry";
import { TEMPLATE_SECTIONS } from "@/lib/editor/blocks.ts";
import { revalidateEditorTarget } from "@/lib/editor/revalidate";

/* Roll Back — republish an earlier version's content/layout as a NEW
   version (append-only history), then revalidate the affected surfaces.
   Atomic in the RPC. Works for content regions, page/template layouts,
   and the navigation document alike. */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJsonBody<{ route: string; regionKey: string; targetVersionNo: number }>(req);
  if (body instanceof NextResponse) return body;

  const route = String(body.route ?? "");
  const regionKey = String(body.regionKey ?? "");
  const isLayout = regionKey === "__layout";
  const isNav = regionKey === "nav" && route === "__site";

  if (isLayout) {
    if (!sectionsForRoute(route)) {
      if (!/^\/[a-z0-9-]+$/.test(route)) return NextResponse.json({ ok: false, error: "Unknown layout target" }, { status: 400 });
      const { data } = await ctx.db.from("editor_pages").select("slug, status").eq("slug", route.slice(1)).maybeSingle();
      if (!data) return NextResponse.json({ ok: false, error: "Unknown page" }, { status: 400 });
      if (data.status !== "published") {
        return NextResponse.json({ ok: false, error: "Publish the page before rolling back its layout" }, { status: 400 });
      }
    }
  } else if (!isNav) {
    const def = regionDef(route, regionKey);
    if (!def) return NextResponse.json({ ok: false, error: "Unknown region" }, { status: 400 });
  }

  const { data, error } = await ctx.db.rpc("editor_rollback", {
    p_route: route,
    p_region_key: regionKey,
    p_target_version_no: Number(body.targetVersionNo),
    p_admin_email: ctx.admin.email,
  });
  if (error) {
    if (migrationMissing(error.message)) return migration503();
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const { revalidated, revalidateError } = await revalidateEditorTarget(ctx.db, route);
  return NextResponse.json({ ok: true, publishedVersion: data, revalidated, revalidateError });
}
