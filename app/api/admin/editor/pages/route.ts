import { NextResponse } from "next/server";
import { editorGate, migrationMissing } from "@/lib/editor/api";

/* Region status map for the desk navigator. The client builds the page
   tree from the code-owned registry; this returns only which regions have
   drafts/published overrides — one query, small payload. */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const { data, error } = await ctx.db
    .from("editor_documents")
    .select("route, region_key, published_version_id, draft_version_id");

  if (error) {
    if (migrationMissing(error.message)) {
      return NextResponse.json({ ok: true, migrationApplied: false, statuses: {} });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const statuses: Record<string, string> = {};
  for (const d of data ?? []) {
    const key = `${d.route}#${d.region_key}`;
    if (d.published_version_id && d.draft_version_id) statuses[key] = "published+draft";
    else if (d.published_version_id) statuses[key] = "published";
    else if (d.draft_version_id) statuses[key] = "draft";
  }
  return NextResponse.json({ ok: true, migrationApplied: true, statuses });
}
