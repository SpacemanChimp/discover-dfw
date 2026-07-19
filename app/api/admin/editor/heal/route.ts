import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { editorGate, readJsonBody } from "@/lib/editor/api";
import { pageByRoute } from "@/lib/editor/registry";
import { editorTag } from "@/lib/editor/overrides";

/* Heal — audited revalidation retry for a publish whose revalidation
   failed (the Photo Desk pattern: publication truth lives in the DB; this
   only re-syncs the cache and records that a human ran it). */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJsonBody<{ route: string }>(req);
  if (body instanceof NextResponse) return body;

  const page = pageByRoute(String(body.route ?? ""));
  if (!page) return NextResponse.json({ ok: false, error: "Unknown route" }, { status: 400 });

  let revalidated = true;
  let revalidateError: string | null = null;
  try {
    revalidateTag(editorTag(page.route));
    for (const p of page.revalidatePaths) revalidatePath(p);
  } catch (e) {
    revalidated = false;
    revalidateError = e instanceof Error ? e.message : String(e);
  }

  await ctx.db.from("verification_events").insert({
    entity_type: "editor_region",
    entity_slug: page.route,
    verified_by: ctx.admin.email,
    verification_method: "admin_review",
    action: "verify",
    notes: revalidated ? "revalidation heal ran clean" : `revalidation heal FAILED: ${revalidateError}`,
  });

  return NextResponse.json({ ok: revalidated, revalidated, revalidateError });
}
