/* One-off maintenance (run once, post-merge, with explicit approval):
 * rename the seeded Heath Golf & Yacht Club row to its canonical slug.
 *
 *   heath/heath-golf-yacht-club  ->  heath/heath-golf-and-yacht-club
 *
 * The seeder's local slugifyHood copy was missing the & -> " and " rule
 * (fixed in seed-new-build-communities.mjs in this same PR), so the row
 * pointed at a 404 and its band publish on 2026-07-12 was rolled back.
 * All dependents (aliases, builders, inventory stats) FK by community id,
 * so the rename touches exactly one row. Refuses if the row is published
 * or the target slug already exists. Audits to verification_events.
 *
 * Run: node --env-file=.env.local scripts/content/fix-heath-slug.mjs
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const OLD = "heath/heath-golf-yacht-club";
const NEW = "heath/heath-golf-and-yacht-club";
const NEW_HOOD = "heath-golf-and-yacht-club";

const { data: row, error: e1 } = await db
  .from("new_build_communities")
  .select("id, slug, hood_slug, published")
  .eq("slug", OLD)
  .maybeSingle();
if (e1) throw new Error(e1.message);
if (!row) {
  const { data: done } = await db.from("new_build_communities").select("id").eq("slug", NEW).maybeSingle();
  console.log(done ? `already fixed — ${NEW} exists, nothing to do` : `NEITHER slug found — investigate before re-running`);
  process.exitCode = done ? 0 : 2;
} else {
  if (row.published) throw new Error("row is published — refusing to rename a live band's slug");
  const { data: clash } = await db.from("new_build_communities").select("id").eq("slug", NEW).maybeSingle();
  if (clash) throw new Error(`target slug ${NEW} already exists (id ${clash.id}) — refusing`);

  const { error: e2 } = await db
    .from("new_build_communities")
    .update({ slug: NEW, hood_slug: NEW_HOOD })
    .eq("id", row.id);
  if (e2) throw new Error(`update failed: ${e2.message}`);

  const { error: e3 } = await db.from("verification_events").insert({
    entity_type: "new_build_community",
    entity_slug: NEW,
    verified_by: process.env.ADMIN_EMAILS?.split(",")[0]?.trim() ?? "admin",
    verification_method: "admin_review",
    action: "verify",
    notes: `slug corrected ${OLD} -> ${NEW} (seeder slugify missed the & -> " and " rule; the 2026-07-12 band publish revalidated a 404 and was rolled back)`,
  });

  const { data: after } = await db.from("new_build_communities").select("slug, hood_slug, published").eq("id", row.id).single();
  console.log(JSON.stringify({ fixed: after, auditError: e3?.message ?? null }));
}
