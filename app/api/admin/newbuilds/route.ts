import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { hoodPageExists } from "@/lib/content/admin-newbuilds";

/* New Build Controls — publish/unpublish the inventory band for ONE
   community per request. Admin-only (ADMIN_EMAILS gate first, 404
   otherwise). Guard rails:
   - a typed confirmation phrase (PUBLISH <slug> / UNPUBLISH <slug>) is
     required in the body — no one-click flips
   - publishing refuses when the community has no hood page or no
     snapshot (there would be nothing truthful to render)
   - every flip writes a verification_events row and revalidates the
     hood + city pages so the static pages regenerate without a deploy
   The FIRST flip through this route is its own supervised gate — the
   route existing does not authorize using it. */

export const runtime = "nodejs";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  const adminUser = await getAdminUser();
  if (!adminUser) return NextResponse.json({ ok: false }, { status: 404 }); // don't advertise the surface
  const db = getSupabaseAdmin();
  if (!db) return bad("Not configured", 503);

  let body: { action?: string; communityId?: string; confirm?: string };
  try {
    body = await req.json();
  } catch {
    return bad("Expected JSON body");
  }
  if (body.action !== "publish" && body.action !== "unpublish") return bad(`Unknown action "${body.action}"`);
  const publish = body.action === "publish";

  const communityId = String(body.communityId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(communityId)) return bad("Missing communityId");

  const { data: c, error: getErr } = await db
    .from("new_build_communities")
    .select("id, slug, name, city_slug, hood_slug, published")
    .eq("id", communityId)
    .single();
  if (getErr || !c) return bad("Community not found", 404);

  const expected = `${publish ? "PUBLISH" : "UNPUBLISH"} ${c.slug}`;
  if (body.confirm !== expected) return bad(`Type the confirmation phrase exactly: ${expected}`, 428);
  if (c.published === publish) return bad(`Already ${publish ? "published" : "unpublished"}`, 409);

  if (publish) {
    if (!c.hood_slug) return bad("No hood page — nothing to render a band on", 422);
    // a non-null hood_slug can still point at a 404 (seeded slug drift, e.g.
    // the & -> " and " rule) — publishing would flip a band no page renders
    // and revalidate a nonexistent path. Refuse; unpublish stays allowed so
    // a bad flip can always be rolled back.
    if (!hoodPageExists(c.city_slug, c.hood_slug))
      return bad(
        `Hood slug "${c.hood_slug}" resolves to no page under /city/${c.city_slug} — fix the seeded slug before publishing`,
        422
      );
    const { data: snap } = await db
      .from("community_inventory_stats")
      .select("active_listing_count, calculated_at")
      .eq("community_id", c.id)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!snap) return bad("No inventory snapshot — run NB-1 --stats first", 422);
  }

  const { error: updErr } = await db.from("new_build_communities").update({ published: publish }).eq("id", c.id);
  if (updErr) return bad(updErr.message, 500);

  // audit (allowed actions include publish/unpublish since 0009)
  const { error: evErr } = await db.from("verification_events").insert({
    entity_type: "new_build_community",
    entity_slug: c.slug,
    verified_by: adminUser.email,
    verification_method: "admin_review",
    action: publish ? "publish" : "unpublish",
    notes: `inventory band ${publish ? "published" : "unpublished"} via New Build Controls`,
  });

  // regenerate the static pages this flip affects
  const paths: string[] = [];
  let revalidated = false;
  try {
    if (c.hood_slug) {
      revalidatePath(`/city/${c.city_slug}/${c.hood_slug}`);
      paths.push(`/city/${c.city_slug}/${c.hood_slug}`);
    }
    revalidatePath(`/city/${c.city_slug}`);
    paths.push(`/city/${c.city_slug}`);
    revalidated = true;
  } catch {
    /* flip stands; report revalidation failure so the admin can redeploy */
  }

  return NextResponse.json({ ok: true, published: publish, revalidated, paths, auditError: evErr?.message ?? null });
}
