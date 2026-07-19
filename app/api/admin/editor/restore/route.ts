import { NextResponse } from "next/server";
import { editorGate, migrationMissing, migration503, readJsonBody } from "@/lib/editor/api";
import { regionDef, sectionsForRoute } from "@/lib/editor/registry";
import { TEMPLATE_SECTIONS } from "@/lib/editor/blocks.ts";
import { revalidateEditorTarget } from "@/lib/editor/revalidate";

/* Restore Code Fallback — clears ONLY the published-override pointer
   (atomic RPC; history and media preserved), then revalidates so the
   code-owned content/layout is public again. Admin-created pages have no
   code fallback — they use Unpublish (site-pages API) instead. */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJsonBody<{ route: string; regionKey: string }>(req);
  if (body instanceof NextResponse) return body;

  const route = String(body.route ?? "");
  const regionKey = String(body.regionKey ?? "");

  if (regionKey === "__layout") {
    if (!sectionsForRoute(route)) {
      return NextResponse.json(
        { ok: false, error: "Admin-created pages have no code fallback — use Unpublish in Page Settings instead" },
        { status: 400 }
      );
    }
  } else if (!(regionKey === "nav" && route === "__site")) {
    const def = regionDef(route, regionKey);
    if (!def) return NextResponse.json({ ok: false, error: "Unknown region" }, { status: 400 });
  }

  const { error } = await ctx.db.rpc("editor_restore_fallback", {
    p_route: route,
    p_region_key: regionKey,
    p_admin_email: ctx.admin.email,
  });
  if (error) {
    if (migrationMissing(error.message)) return migration503();
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const { revalidated, revalidateError } = await revalidateEditorTarget(ctx.db, route);
  return NextResponse.json({ ok: true, revalidated, revalidateError });
}
