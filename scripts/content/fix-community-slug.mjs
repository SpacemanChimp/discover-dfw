/* One-off data repair — canonicalize seeded community slugs (the & rule).
 *
 * seed-new-build-communities.mjs and seed-photo-slots.mjs carried local
 * slugifyHood mirrors that skipped lib/slug.ts's & -> " and " rule, so
 * "Heath Golf & Yacht Club" seeded slug heath/heath-golf-yacht-club — a
 * path that 404s while the real page heath/heath-golf-and-yacht-club never
 * joins its inventory band (publish 2026-07-12 18:02Z, rolled back). Both
 * seeders are fixed; this script repairs the rows they left behind.
 *
 * Tiers (CI-2 discipline):
 *   (default)  READ-ONLY — connects, reports every new_build_communities /
 *              photo_slots row whose slug does not resolve to a rendered
 *              hood page, with canonical-target + collision + published
 *              checks. No writes, no job-run row claimed.
 *   --apply    Updates rows whose canonical target resolves and is free.
 *              Requires CONTENT_INTELLIGENCE_DRY_RUN=false (exactly).
 *              Claims the content_job_runs single-flight lock (job_name
 *              'fix_community_slugs'). REFUSES published=true communities —
 *              a live band is never moved silently. community_drafts /
 *              community_content_drafts rows are REPORT-ONLY either way;
 *              verification_events history is never rewritten.
 *
 * Run: node --env-file=<path to .env.local> scripts/content/fix-community-slug.mjs [--apply]
 * Never call process.exit() once a client exists (CI-2 libuv lesson).
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const APPLY = process.argv.slice(2).includes("--apply");
if (APPLY && process.env.CONTENT_INTELLIGENCE_DRY_RUN !== "false") {
  console.error(
    "REFUSED: --apply writes to the database.\n" +
      "It requires CONTENT_INTELLIGENCE_DRY_RUN=false (exactly). Unset or any other value refuses."
  );
  process.exit(1);
}

const data = require("../../lib/dfw.data.json");

/* mirrors lib/slug.ts slugifyHood exactly (incl. the & -> " and " rule) */
const slugifyHood = (n) =>
  String(n)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* the real page set: hoods array UNION newBuilds per city, mirroring
   lib/hoods.ts hoodsForCity() — a slug outside this set 404s */
const pagesByCity = new Map();
for (const c of data.cities) {
  const set = new Set((c.hoods ?? []).map(([n]) => slugifyHood(n)));
  pagesByCity.set(c.slug, set);
}
for (const nb of data.newBuilds ?? []) pagesByCity.get(nb.city)?.add(slugifyHood(nb.name));
const pageExists = (citySlug, hoodSlug) => pagesByCity.get(citySlug)?.has(hoodSlug) ?? false;

const { createClient } = await import("@supabase/supabase-js");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("REFUSED: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY not set.");
  process.exit(1);
}
const db = createClient(url, secret);

const fail = (msg) => {
  console.error(msg);
  process.exitCode = 1;
};

let communityFixes = [];
let slotFixes = [];

/* ---- scan new_build_communities ---------------------------------------- */
const { data: communities, error: cErr } = await db
  .from("new_build_communities")
  .select("id, slug, name, city_slug, hood_slug, published");
if (cErr) {
  fail(`SCAN FAILED (new_build_communities): ${cErr.message}`);
} else {
  const takenSlugs = new Set(communities.map((r) => r.slug));
  for (const r of communities) {
    const resolves = !!r.hood_slug && pageExists(r.city_slug, r.hood_slug);
    const consistent = r.slug === `${r.city_slug}/${r.hood_slug}`;
    if (resolves && consistent) continue;
    const canonicalHood = slugifyHood(r.name);
    const target = `${r.city_slug}/${canonicalHood}`;
    const blockers = [];
    if (!pageExists(r.city_slug, canonicalHood)) blockers.push(`canonical "${target}" is not a page either`);
    if (target !== r.slug && takenSlugs.has(target)) blockers.push(`slug "${target}" already taken by another row`);
    if (r.published) blockers.push("row is PUBLISHED — unpublish before moving (never move a live band)");
    communityFixes.push({ ...r, canonicalHood, target, blockers });
    console.log(
      `community ${r.slug} ("${r.name}"): hood_slug "${r.hood_slug}" does not resolve` +
        (blockers.length ? ` — BLOCKED: ${blockers.join("; ")}` : ` — would fix to ${target}`)
    );
  }
  if (!communityFixes.length) console.log("new_build_communities: all rows resolve to real pages — nothing to fix.");
}

/* ---- scan photo_slots (neighborhood heroes carry city/hood slugs) ------- */
const { data: slots, error: sErr } = await db
  .from("photo_slots")
  .select("id, entity_type, entity_slug, slot_key, label, status")
  .eq("entity_type", "neighborhood");
if (sErr) {
  fail(`SCAN FAILED (photo_slots): ${sErr.message}`);
} else {
  const takenKeys = new Set(slots.map((r) => `${r.entity_slug}|${r.slot_key}`));
  for (const r of slots) {
    const cut = r.entity_slug.indexOf("/");
    const citySlug = cut === -1 ? r.entity_slug : r.entity_slug.slice(0, cut);
    const hoodSlug = cut === -1 ? "" : r.entity_slug.slice(cut + 1);
    if (pageExists(citySlug, hoodSlug)) continue;
    const target = `${citySlug}/${slugifyHood(r.label)}`;
    const blockers = [];
    if (!pageExists(citySlug, slugifyHood(r.label))) blockers.push(`canonical "${target}" is not a page either`);
    if (takenKeys.has(`${target}|${r.slot_key}`)) blockers.push(`slot ${target}/${r.slot_key} already exists`);
    slotFixes.push({ ...r, target, blockers });
    console.log(
      `photo_slot ${r.entity_slug} · ${r.slot_key} ("${r.label}", status ${r.status}): does not resolve` +
        (blockers.length ? ` — BLOCKED: ${blockers.join("; ")}` : ` — would fix to ${target}`)
    );
  }
  if (!slotFixes.length) console.log("photo_slots: all neighborhood slots resolve to real pages — nothing to fix.");
}

/* ---- report-only: drafts + audit history keyed by a bad slug ------------ */
for (const f of communityFixes) {
  const [{ count: drafts }, { count: contentDrafts }, { count: events }] = await Promise.all([
    db.from("community_drafts").select("id", { count: "exact", head: true }).eq("city_slug", f.city_slug).eq("slug", f.hood_slug ?? ""),
    db.from("community_content_drafts").select("id", { count: "exact", head: true }).eq("city_slug", f.city_slug).eq("hood_slug", f.hood_slug ?? ""),
    db.from("verification_events").select("id", { count: "exact", head: true }).eq("entity_slug", f.slug),
  ]);
  if (drafts) console.log(`  report-only: ${drafts} community_drafts row(s) keyed ${f.city_slug}/${f.hood_slug} — fix by hand if intended for this page`);
  if (contentDrafts) console.log(`  report-only: ${contentDrafts} community_content_drafts row(s) keyed ${f.city_slug}/${f.hood_slug} — fix by hand if intended for this page`);
  if (events) console.log(`  report-only: ${events} verification_events row(s) reference "${f.slug}" — history, never rewritten`);
}

const fixableCommunities = communityFixes.filter((f) => !f.blockers.length);
const fixableSlots = slotFixes.filter((f) => !f.blockers.length);

if (!APPLY) {
  console.log(
    `\nREAD-ONLY — nothing written. fixable: ${fixableCommunities.length} community(ies), ${fixableSlots.length} photo slot(s); ` +
      `blocked: ${communityFixes.length - fixableCommunities.length + slotFixes.length - fixableSlots.length}. ` +
      "Apply with --apply and CONTENT_INTELLIGENCE_DRY_RUN=false."
  );
} else if (process.exitCode !== 1) {
  await runApply();
}

async function runApply() {
  const { data: run, error } = await db
    .from("content_job_runs")
    .insert({ job_name: "fix_community_slugs", dry_run: false })
    .select("id")
    .single();
  if (error) {
    fail(
      error.code === "23505"
        ? "REFUSED: another fix_community_slugs run is in flight (or a crashed run holds the lock)."
        : `REFUSED: could not claim job run: ${error.message}`
    );
    return;
  }
  let fixed = 0, failed = 0;
  const logError = (item_ref, stage, message) =>
    db.from("content_job_errors").insert({ run_id: run.id, item_ref, stage, message: String(message).slice(0, 800) }).then(() => {});
  try {
    for (const f of fixableCommunities) {
      // published=false in the filter re-checks the live-band guard at write time
      const { data: upd, error: uErr } = await db
        .from("new_build_communities")
        .update({ slug: f.target, hood_slug: f.canonicalHood })
        .eq("id", f.id)
        .eq("published", false)
        .select("id");
      if (uErr || !upd?.length) { failed++; await logError(f.slug, "community_slug_fix", uErr?.message ?? "no row updated (published flipped since scan?)"); }
      else { fixed++; console.log(`fixed community: ${f.slug} → ${f.target}`); }
    }
    for (const f of fixableSlots) {
      const { error: uErr } = await db.from("photo_slots").update({ entity_slug: f.target }).eq("id", f.id);
      if (uErr) { failed++; await logError(`${f.entity_slug}|${f.slot_key}`, "photo_slot_slug_fix", uErr.message); }
      else { fixed++; console.log(`fixed photo_slot: ${f.entity_slug} · ${f.slot_key} → ${f.target}`); }
    }
  } finally {
    await db
      .from("content_job_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: failed > 0 ? "partial" : "success",
        items_seen: communityFixes.length + slotFixes.length,
        items_written: fixed,
        error_summary: failed > 0 ? `${failed} failure(s) — see content_job_errors` : null,
      })
      .eq("id", run.id);
  }
  console.log(`\nAPPLY complete: fixed=${fixed} failed=${failed} (run ${run.id})`);
  process.exitCode = failed > 0 ? 1 : 0;
}
