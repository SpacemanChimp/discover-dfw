/* Content Intelligence Loop — photo_slots seeder (Phase CI-2).
 *
 * Computes every editorial photo slot from lib/dfw.data.json and seeds the
 * photo_slots table behind three strictly-ordered privilege tiers:
 *
 *   (default)  OFFLINE dry-run — no database client is even imported;
 *              prints the computed inventory. Cannot write by construction.
 *   --diff     READ-ONLY database comparison — connects with the service
 *              key, fetches existing slots, prints would-insert /
 *              would-update / would-skip-protected / orphaned. Zero writes;
 *              deliberately does NOT claim a job-run row (claiming writes).
 *   --apply    Performs the writes. Requires BOTH the flag AND the env var
 *              CONTENT_INTELLIGENCE_DRY_RUN set to exactly "false" — unset
 *              or any other value behaves as protected/dry-run. Claims a
 *              content_job_runs row first (single-flight lock).
 *
 * Other flags: --limit=N (cap slots processed), --only=<city-slug>.
 * Run: node --env-file=.env.local scripts/content/seed-photo-slots.mjs [flags]
 *
 * Slot inventory (verified against main 012d440, corrected 2026-07-10):
 *   city galleries : 21 cities x 3 curated labels = 63 explicit
 *                    69 cities x 3 fallback labels = 207 fallback
 *   hood heroes    : 361 — the union of each city's hoods array PLUS its
 *                    newBuilds entries, mirroring lib/hoods.ts
 *                    hoodsForCity() (newBuilds-only pages like
 *                    fort-worth/ventana are real rendered pages).
 *                    New-build communities share these hood-hero slots.
 *   homepage picks : 4 (EditorsPicks)
 *   total          : 635
 *
 * Idempotency: existing slots are updated ONLY while status = 'missing'
 * and only on dataset-derived fields; touched slots (any other status)
 * are never modified. Nothing is ever deleted — orphans are reported.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const DIFF = argv.includes("--diff");
const limit = Number((argv.find((a) => a.startsWith("--limit=")) ?? "").split("=")[1]) || 0;
const only = (argv.find((a) => a.startsWith("--only=")) ?? "").split("=")[1] || "";

if (APPLY && process.env.CONTENT_INTELLIGENCE_DRY_RUN !== "false") {
  console.error(
    "REFUSED: --apply requires CONTENT_INTELLIGENCE_DRY_RUN=false (exactly).\n" +
      "Unset or any other value is treated as dry-run/protected — no writes."
  );
  process.exit(1);
}

const data = require("../../lib/dfw.data.json");

// mirror of app/city/[slug]/page.tsx — cities without an explicit gallery
// render these three generic labels
const FALLBACK_LABELS = (name) => [
  `${name} signature landmark`,
  "neighborhood streetscape",
  "parks & greenbelt",
];

// hard-coded in components/EditorsPicks.tsx
const HOMEPAGE_PICKS = [
  { slug: "denton", label: "THE COURTHOUSE SQUARE" },
  { slug: "fort-worth", label: "THE STOCKYARDS" },
  { slug: "dallas", label: "THE SKYLINE" },
  { slug: "frisco", label: "THE STAR DISTRICT" },
];

const slugifyHood = (n) =>
  n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function computeSlots() {
  const slots = [];
  const cities = only ? data.cities.filter((c) => c.slug === only) : data.cities;

  for (const c of cities) {
    const explicit = Array.isArray(c.gallery) && c.gallery.length > 0;
    const labels = explicit ? c.gallery : FALLBACK_LABELS(c.name);
    labels.forEach((label, i) =>
      slots.push({
        entity_type: "city",
        entity_slug: c.slug,
        slot_key: `gallery-${i}`,
        label,
        label_source: explicit ? "explicit" : "fallback",
        search_query: `${c.name} Texas ${label.replace(/^the /i, "")}`,
        preferred_orientation: "landscape",
        required_place_name: c.name,
        latitude: c.ll?.[1] ?? null,
        longitude: c.ll?.[0] ?? null,
      })
    );
    // hood pages are the UNION of the hoods array + newBuilds registered to
    // the city (lib/hoods.ts hoodsForCity) — mirror that union here or we
    // miss newBuilds-only pages like fort-worth/ventana
    const hoodNames = (c.hoods ?? []).map(([n]) => n);
    const hoodSlugSet = new Set(hoodNames.map(slugifyHood));
    for (const b of (data.newBuilds ?? []).filter((b) => b.city === c.slug)) {
      if (!hoodSlugSet.has(slugifyHood(b.name))) hoodNames.push(b.name);
    }
    for (const hoodName of hoodNames) {
      slots.push({
        entity_type: "neighborhood",
        entity_slug: `${c.slug}/${slugifyHood(hoodName)}`,
        slot_key: "hero",
        label: hoodName,
        label_source: "explicit",
        search_query: `${hoodName} ${c.name} Texas neighborhood`,
        preferred_orientation: "landscape",
        required_place_name: `${hoodName}, ${c.name}`,
        latitude: c.ll?.[1] ?? null,
        longitude: c.ll?.[0] ?? null,
      });
    }
  }
  if (!only) {
    for (const p of HOMEPAGE_PICKS) {
      const c = data.cities.find((x) => x.slug === p.slug);
      slots.push({
        entity_type: "homepage",
        entity_slug: p.slug,
        slot_key: "pick",
        label: p.label,
        label_source: "explicit",
        search_query: `${c?.name ?? p.slug} Texas ${p.label.toLowerCase()}`,
        preferred_orientation: "landscape",
        required_place_name: c?.name ?? p.slug,
        latitude: c?.ll?.[1] ?? null,
        longitude: c?.ll?.[0] ?? null,
      });
    }
  }
  return limit > 0 ? slots.slice(0, limit) : slots;
}

const keyOf = (s) => `${s.entity_type} ${s.entity_slug} ${s.slot_key}`;

// dataset-derived fields the seeder owns while a slot is untouched
const SEED_FIELDS = [
  "label", "label_source", "search_query", "required_place_name",
  "latitude", "longitude", "preferred_orientation",
];
const differs = (want, have) =>
  SEED_FIELDS.some((f) => (want[f] ?? null) !== (have[f] ?? null));

function printInventory(slots) {
  const byType = {}, bySource = {};
  for (const s of slots) {
    byType[s.entity_type] = (byType[s.entity_type] ?? 0) + 1;
    bySource[s.label_source] = (bySource[s.label_source] ?? 0) + 1;
  }
  console.log("computed photo_slots:", slots.length);
  console.log("  by entity_type:", JSON.stringify(byType));
  console.log("  by label_source:", JSON.stringify(bySource));
}

const slots = computeSlots();

if (!DIFF && !APPLY) {
  console.log("DRY RUN (offline) — nothing written; no database client loaded.");
  printInventory(slots);
  for (const s of slots.slice(0, 5))
    console.log(`  [${s.entity_type}] ${s.entity_slug} · ${s.slot_key} · "${s.label}" (${s.label_source})`);
  console.log("Next tiers: --diff (read-only DB compare) · --apply (writes; needs CONTENT_INTELLIGENCE_DRY_RUN=false)");
  process.exit(0);
}

// ---- --diff and --apply from here: database client required ---------------
const { createClient } = await import("@supabase/supabase-js");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("REFUSED: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY not set.");
  process.exit(1);
}
const db = createClient(url, secret);

// read ALL existing slots — paged, PostgREST caps responses at 1,000 rows
async function fetchExisting() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await db
      .from("photo_slots")
      .select("id, entity_type, entity_slug, slot_key, status, " + SEED_FIELDS.join(", "))
      .range(from, from + 999);
    if (error) throw new Error(`fetch existing: ${error.message}`);
    rows.push(...(page ?? []));
    if ((page ?? []).length < 1000) break;
  }
  return rows;
}

const existing = await fetchExisting();
const byKey = new Map(existing.map((r) => [keyOf(r), r]));
const computedKeys = new Set(slots.map(keyOf));

const inserts = [], updates = [], protectedSkips = [];
for (const s of slots) {
  const have = byKey.get(keyOf(s));
  if (!have) inserts.push(s);
  else if (have.status !== "missing") protectedSkips.push(s);
  else if (differs(s, have)) updates.push({ id: have.id, ...s });
}
// report-only: DB rows whose source label vanished from the dataset.
// --only/--limit shrink the computed set, which would misreport orphans —
// suppress the orphan report on scoped runs.
const orphans = only || limit > 0 ? [] : existing.filter((r) => !computedKeys.has(keyOf(r)));

printInventory(slots);
console.log(`existing rows: ${existing.length}`);
console.log(`would insert: ${inserts.length} | would update: ${updates.length} | protected (status != missing, never touched): ${protectedSkips.length} | orphaned in DB (report only, never deleted): ${orphans.length}`);
for (const o of orphans.slice(0, 10))
  console.log(`  orphan: [${o.entity_type}] ${o.entity_slug} · ${o.slot_key}`);

if (DIFF && !APPLY) {
  console.log("--diff complete — read-only, nothing written, no job-run row claimed.");
  process.exit(0);
}

// ---- --apply: claim the single-flight run row, then write -----------------
const { data: run, error: claimErr } = await db
  .from("content_job_runs")
  .insert({ job_name: "seed_photo_slots", dry_run: false })
  .select("id")
  .single();
if (claimErr) {
  console.error(
    claimErr.code === "23505"
      ? "REFUSED: another seed_photo_slots run is in flight (or a crashed run holds the lock).\n" +
          "Release a crashed run: update content_job_runs set finished_at = now(), status = 'failed' " +
          "where job_name = 'seed_photo_slots' and finished_at is null;"
      : `REFUSED: could not claim job run: ${claimErr.message}`
  );
  process.exit(1);
}

let inserted = 0, updated = 0, failed = 0;
const logError = (item_ref, stage, message) =>
  db.from("content_job_errors").insert({ run_id: run.id, item_ref, stage, message }).then(() => {});

try {
  for (let i = 0; i < inserts.length; i += 200) {
    const batch = inserts.slice(i, i + 200);
    const { error } = await db.from("photo_slots").insert(batch);
    if (!error) { inserted += batch.length; continue; }
    // one bad row can poison a batch — retry rows individually
    for (const row of batch) {
      const { error: rowErr } = await db.from("photo_slots").insert(row);
      if (rowErr) { failed++; await logError(keyOf(row).replaceAll(" ", "/"), "insert", rowErr.message); }
      else inserted++;
    }
  }
  for (const u of updates) {
    const { id, ...fields } = u;
    const patch = Object.fromEntries(SEED_FIELDS.map((f) => [f, fields[f] ?? null]));
    const { error } = await db.from("photo_slots").update(patch).eq("id", id).eq("status", "missing");
    if (error) { failed++; await logError(`${u.entity_type}/${u.entity_slug}/${u.slot_key}`, "update", error.message); }
    else updated++;
  }
} finally {
  await db
    .from("content_job_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: failed > 0 ? "partial" : "success",
      items_seen: slots.length,
      items_written: inserted + updated,
      error_summary: failed > 0 ? `${failed} item(s) failed — see content_job_errors` : null,
    })
    .eq("id", run.id);
}

console.log(`APPLY complete: inserted=${inserted} updated=${updated} failed=${failed} (run ${run.id})`);
process.exit(failed > 0 ? 1 : 0);
