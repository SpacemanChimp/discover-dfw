/* Content Intelligence Loop — photo_slots seed (Phase CI-1: DRY-RUN ONLY).
 *
 * Computes every editorial photo slot from lib/dfw.data.json and prints
 * what Phase CI-2 would insert. This stub deliberately has NO database
 * client and NO network access — it cannot write anywhere. The --apply
 * flag is rejected until the Phase CI-2 approval unlocks it.
 *
 * Run: node scripts/content/seed-photo-slots.mjs [--limit=N] [--only=slug]
 *
 * Slot inventory (verified against main 012d440, corrected 2026-07-10):
 *   city galleries : 21 cities x 3 curated labels = 63 explicit
 *                    69 cities x 3 fallback labels = 207 fallback
 *   hood heroes    : 361 — the union of each city's hoods array PLUS its
 *                    newBuilds entries, mirroring lib/hoods.ts
 *                    hoodsForCity() (newBuilds-only pages like
 *                    fort-worth/ventana are real rendered pages, NOT 404s
 *                    — auditing the raw hoods array alone undercounts).
 *                    New-build communities share these hood-hero slots;
 *                    no separate new_build rows.
 *   homepage picks : 4 (EditorsPicks)
 *   total          : 635
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

if (process.argv.includes("--apply")) {
  console.error(
    "REFUSED: --apply is locked until Phase CI-2 is approved. This stub is dry-run only."
  );
  process.exit(1);
}

const limit = Number((process.argv.find((a) => a.startsWith("--limit=")) ?? "").split("=")[1]) || 0;
const only = (process.argv.find((a) => a.startsWith("--only=")) ?? "").split("=")[1] || "";

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

// every newBuild maps onto a hood-hero slot (the union above guarantees
// it) — report the count as a sanity check
const nbHoodSlugs = new Set(
  (data.newBuilds ?? []).map((b) => `${b.city}/${slugifyHood(b.name)}`)
);
const nbCovered = slots.filter(
  (s) => s.entity_type === "neighborhood" && nbHoodSlugs.has(s.entity_slug)
).length;

const byType = {};
const bySource = {};
for (const s of slots) {
  byType[s.entity_type] = (byType[s.entity_type] ?? 0) + 1;
  bySource[s.label_source] = (bySource[s.label_source] ?? 0) + 1;
}

console.log("DRY RUN — nothing written (this stub cannot write).");
console.log("would upsert photo_slots:", slots.length);
console.log("  by entity_type:", JSON.stringify(byType));
console.log("  by label_source:", JSON.stringify(bySource));
console.log(
  `  new-build communities covered by existing hood slots: ${nbCovered}/${nbHoodSlugs.size}`
);
const sample = limit > 0 ? slots.slice(0, limit) : slots.slice(0, 5);
console.log(`sample (${sample.length}):`);
for (const s of sample)
  console.log(
    `  [${s.entity_type}] ${s.entity_slug} · ${s.slot_key} · "${s.label}" (${s.label_source})`
  );
