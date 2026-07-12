/* New Build Intelligence Loop — community seeder (Phase NB-1).
 *
 * Seeds new_build_communities / community_aliases / community_builders from
 * EXISTING DiscoverDFW data only: the curated newBuilds list in
 * lib/dfw.data.json (the sole source of which communities exist) and the
 * local replicated listings store (SubdivisionName / ListOfficeName /
 * PublicRemarks inside raw jsonb). NO external calls of any kind — no
 * provider APIs, no builder websites, no Claude. Nothing here is publishable:
 * every community lands published=false + verification_status='unverified',
 * every builder row is an unverified derivation, and no public page imports
 * these tables.
 *
 * Privilege tiers (same discipline as the CI-2/CI-4 seeders):
 *   (default)  OFFLINE — reads lib/dfw.data.json only. No DB, no network.
 *   --diff     READ-ONLY DB — scans the listings store, reports match
 *              quality (exact / prefix / unmatched / cross-city homonyms),
 *              would-insert counts, and weak list-office names that will
 *              NOT be staged. No writes, no job-run row.
 *   --apply    Inserts communities + aliases + builder derivations.
 *              Requires the flag AND CONTENT_INTELLIGENCE_DRY_RUN=false
 *              exactly. Claims the content_job_runs single-flight lock
 *              (job_name 'seed_new_build_communities'). INSERT-ONLY:
 *              existing rows are never updated — a slug/alias/builder
 *              conflict skips, so anything a human touched stays intact.
 *   --stats    SEPARATE gated run (same env requirement): appends one
 *              community_inventory_stats snapshot per matched community
 *              (job_name 'new_build_inventory_stats'). Never bundled into
 *              --apply so seed re-runs can't append snapshot noise.
 *
 * Other flags: --only=<city-slug>.
 *
 * Builder derivation policy (amendment 1 — MLS BuilderName is 0% populated,
 * a probed feed reality):
 *   list_office    VERY WEAK. Staged ONLY when the office name matches the
 *                  known-builder lexicon (stored under the canonical name)
 *                  or is clearly builder-like (contains "HOMES" and no
 *                  realty/brokerage marker). Everything else is reported in
 *                  --diff and NOT inserted.
 *   public_remarks Lexicon matches only (word-bounded) — safer signal.
 * Builder facts require human verification before any publish (hard rule);
 * NB-1 stages candidates, verifies nothing, publishes nothing.
 *
 * Matching encodes the homonym lessons (Pecan Square Condos, Addison ≠
 * Pecan Square, Northlake; Lakewood Heights, GA): a subdivision matches a
 * community only on normalized-name match AND city_slug equality. Phase/
 * section suffixes are stripped by normalization ("PECAN SQUARE PH 2B" →
 * "PECAN SQUARE").
 *
 * Never call process.exit() once any client exists (CI-2 lesson).
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const DIFF = argv.includes("--diff");
const STATS = argv.includes("--stats");
const only = (argv.find((a) => a.startsWith("--only=")) ?? "").split("=")[1] || "";

if (APPLY && STATS) {
  console.error("REFUSED: run --apply and --stats as separate invocations (stats are a separate gate).");
  process.exit(1);
}
if ((APPLY || STATS) && process.env.CONTENT_INTELLIGENCE_DRY_RUN !== "false") {
  console.error(
    "REFUSED: --apply and --stats write to the database.\n" +
      "Both require CONTENT_INTELLIGENCE_DRY_RUN=false (exactly). Unset or any other value refuses."
  );
  process.exit(1);
}

const data = require("../../lib/dfw.data.json");

/* editorial status strings → schema enum; anything unmapped stays
   'unverified' (the schema's needs-review value) rather than guessed */
const STATUS_MAP = { "NOW SELLING": "now_selling", "MODELS OPEN": "models_open", "FINAL PHASE": "final_phase", "SOLD OUT": "sold_out" };

/* Known DFW-market builders — canonical names. Lexicon hits are stored
   under these canonical spellings so unique(community_id, builder_name)
   dedupes across messy office-name variants. */
const BUILDER_LEXICON = [
  "Highland Homes", "Perry Homes", "David Weekley Homes", "Coventry Homes", "Chesmar Homes",
  "American Legend Homes", "Britton Homes", "Drees Custom Homes", "Gehan Homes", "Brightland Homes",
  "Trophy Signature Homes", "HistoryMaker Homes", "Bloomfield Homes", "First Texas Homes", "Grand Homes",
  "Shaddock Homes", "Toll Brothers", "Tri Pointe Homes", "Beazer Homes", "Centex", "Pulte Homes",
  "Del Webb", "Lennar", "D.R. Horton", "KB Home", "M/I Homes", "Meritage Homes", "Taylor Morrison",
  "Ashton Woods", "Pacesetter Homes", "Impression Homes", "Sandlin Homes", "Our Country Homes",
  "John Houston Homes", "Antares Homes", "Windsor Homes", "Normandy Homes", "Southgate Homes",
  "Risland Homes", "GFO Home", "Olivia Clarke Homes", "Landsea Homes", "Century Communities",
  "UnionMain Homes", "Mattamy Homes", "Rockhill Homes", "Kindred Homes", "Graham Hart Home Builder",
];

const norm = (s) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* strip trailing phase/section/lot noise: pop trailing tokens that are
   digit-bearing ("2B", "3") or known suffix keywords, repeatedly */
const SUFFIX_TOKENS = new Set(["PH", "PHS", "PHASE", "SEC", "SECT", "SECTION", "BLK", "BLOCK", "ADD", "ADDN", "ADDITION", "UNIT", "INST", "INSTALLMENT", "TR", "TRACT", "LOT", "LOTS", "REP", "REPLAT", "NO"]);
function normalizeSubdivision(s) {
  const tokens = norm(s).split(" ").filter(Boolean);
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    if (/\d/.test(last) || SUFFIX_TOKENS.has(last)) tokens.pop();
    else break;
  }
  return tokens.join(" ");
}

const NORM_LEXICON = BUILDER_LEXICON.map((b) => ({ canonical: b, needle: ` ${norm(b)} ` }));
const lexiconMatch = (text) => {
  const hay = ` ${norm(text)} `;
  return NORM_LEXICON.filter((b) => hay.includes(b.needle)).map((b) => b.canonical);
};
/* builder-like heuristic for non-lexicon office names: must look like a
   builder, must not look like a brokerage */
const builderLike = (name) =>
  /\bHOMES\b/.test(norm(name)) &&
  // brokerage markers: franchises and "Fine Homes"-style marketing tiers
  // are brokerages, not builders (C21 Fine Homes Judge Fite lesson)
  !/\b(REALTY|REAL ESTATE|REALTORS|BROKERAGE|GROUP LLC|C21|CENTURY 21|KELLER WILLIAMS|COLDWELL|COMPASS|EBBY|SOTHEBY S?|FINE HOMES|RE MAX|REMAX|EXP)\b/.test(norm(name));

const slugifyHood = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const cityBySlug = new Map(data.cities.map((c) => [c.slug, c]));
const countyName = (c) => data.counties?.find((co) => co.id === c.county)?.name ?? null;

function plannedCommunities() {
  return data.newBuilds
    .filter((nb) => !only || nb.city === only)
    .map((nb) => {
      const city = cityBySlug.get(nb.city);
      const hoodSlug = slugifyHood(nb.name);
      return {
        slug: `${nb.city}/${hoodSlug}`,
        name: nb.name,
        city_slug: nb.city,
        hood_slug: hoodSlug,
        county: city ? countyName(city) : null,
        status: STATUS_MAP[nb.status] ?? "unverified",
        price_from_label: nb.from ?? null,
        builders_count: nb.builders ?? null, // editorial claim, unverified
        hero_summary: nb.note ?? null,
        normName: normalizeSubdivision(nb.name),
      };
    });
}

const communities = plannedCommunities();

if (!DIFF && !APPLY && !STATS) {
  console.log("DRY RUN (offline) — reads lib/dfw.data.json only; no database, no network.");
  console.log(`planned communities: ${communities.length} (newBuilds entries${only ? `, --only=${only}` : ""})`);
  for (const c of communities)
    console.log(`  [${c.city_slug}] ${c.name} → slug ${c.slug} · status ${c.status} · from ${c.price_from_label ?? "—"} · editorial builders_count ${c.builders_count ?? "—"}`);
  console.log(`builder lexicon: ${BUILDER_LEXICON.length} canonical names · list_office staged only on lexicon/builder-like match · publishes NOTHING (published=false, verification_status='unverified')`);
  console.log("Next tiers: --diff (read-only DB match report) · --apply (insert-only seed) · --stats (separate snapshot run)");
  process.exit(0);
}

/* ---- DB tiers --------------------------------------------------------- */
const { createClient } = await import("@supabase/supabase-js");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("REFUSED: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY not set.");
  process.exit(1);
}
const db = createClient(url, secret);

async function fetchAllPaged(build) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(page ?? []));
    if ((page ?? []).length < 1000) break;
  }
  return rows;
}

/* a thrown top-level await crashes the process before the event loop can
   drain (the CI-2 libuv lesson, uncaught-throw edition) — every DB scan
   goes through this instead */
let scanFailed = false;
async function safeScan(label, fn) {
  try {
    return await fn();
  } catch (e) {
    console.error(`SCAN FAILED (${label}): ${e.message}`);
    scanFailed = true;
    return [];
  }
}

/* the listings store keys cities by NAME ("Fort Worth"), not slug — the
   provider itself filters .eq("city", cityName). Map name↔slug via the
   dataset; unknown city names are ignored. */
const slugByCityName = new Map(data.cities.map((c) => [norm(c.name), c.slug]));
const nameByCitySlug = new Map(data.cities.map((c) => [c.slug, c.name]));
const toCitySlug = (cityName) => slugByCityName.get(norm(cityName)) ?? null;

/* scan 1 — light: subdivision + city for every listing (alias matching +
   homonym detection). No remarks here: they are heavy. */
console.log("scanning listings store (subdivision/city — read-only)…");
const subRowsRaw = await safeScan("subdivision scan", () =>
  fetchAllPaged(() => db.from("listings").select("city, standard_status, subdivision:raw->>SubdivisionName"))
);
const subRows = subRowsRaw
  .map((r) => ({ ...r, city_slug: toCitySlug(r.city) }))
  .filter((r) => r.city_slug);

/* group distinct raw subdivision variants by (normalized name, city) */
const variantsByKey = new Map(); // `${normName}|${city}` -> Map(rawVariant -> count)
const citiesByNormName = new Map(); // normName -> Set(city)
for (const r of subRows) {
  const raw = (r.subdivision ?? "").trim();
  if (!raw) continue;
  const normName = normalizeSubdivision(raw);
  if (!normName) continue;
  const key = `${normName}|${r.city_slug}`;
  if (!variantsByKey.has(key)) variantsByKey.set(key, new Map());
  const m = variantsByKey.get(key);
  m.set(raw, (m.get(raw) ?? 0) + 1);
  if (!citiesByNormName.has(normName)) citiesByNormName.set(normName, new Set());
  citiesByNormName.get(normName).add(r.city_slug);
}

/* match communities: exact normalized equality in the SAME city; prefix
   matches ("PECAN SQUARE NORTH") reported separately for human eyeballs */
for (const c of communities) {
  c.exactVariants = [...(variantsByKey.get(`${c.normName}|${c.city_slug}`)?.keys() ?? [])];
  c.prefixVariants = [];
  for (const [key, variants] of variantsByKey) {
    const [normName, city] = key.split("|");
    if (city !== c.city_slug || normName === c.normName) continue;
    if (normName.startsWith(c.normName + " ")) c.prefixVariants.push(...variants.keys());
  }
  c.aliases = [...new Set([...c.exactVariants, ...c.prefixVariants])];
  c.crossCityHomonyms = [...(citiesByNormName.get(c.normName) ?? [])].filter((city) => city !== c.city_slug);
}

/* scan 2 — heavier: office + remarks, ONLY for active new-construction
   listings in the matched communities' cities */
const matchedCities = [...new Set(communities.filter((c) => c.aliases.length).map((c) => c.city_slug))];
const matchedCityNames = matchedCities.map((s) => nameByCitySlug.get(s)).filter(Boolean);
const nbYear = new Date().getFullYear() - 1;
let nbRows = [];
if (matchedCityNames.length) {
  console.log(`scanning active new-construction listings in ${matchedCityNames.length} matched city(ies)…`);
  const nbRowsRaw = await safeScan("new-construction scan", () =>
    fetchAllPaged(() =>
      db
        .from("listings")
        .select("city, standard_status, year_built, list_price, living_area, subdivision:raw->>SubdivisionName, list_office:raw->>ListOfficeName, remarks:raw->>PublicRemarks")
        .in("city", matchedCityNames)
        .gte("year_built", nbYear)
    )
  );
  nbRows = nbRowsRaw.map((r) => ({ ...r, city_slug: toCitySlug(r.city) })).filter((r) => r.city_slug);
}

/* derive builder candidates per community */
const aliasSetFor = (c) => new Set(c.aliases.map((a) => a));
for (const c of communities) {
  const mine = nbRows.filter((r) => r.city_slug === c.city_slug && aliasSetFor(c).has((r.subdivision ?? "").trim()) && r.standard_status === "Active");
  c.activeNbListings = mine;
  const staged = new Map(); // builder_name -> {derivation, count}
  c.weakOffices = new Map(); // reported, never inserted
  for (const r of mine) {
    const office = (r.list_office ?? "").trim();
    if (office) {
      const lex = lexiconMatch(office);
      if (lex.length) {
        for (const name of lex) {
          const cur = staged.get(name) ?? { derivation: "list_office", count: 0 };
          cur.count++;
          staged.set(name, cur);
        }
      } else if (builderLike(office)) {
        const cur = staged.get(office) ?? { derivation: "list_office", count: 0 };
        cur.count++;
        staged.set(office, cur);
      } else {
        c.weakOffices.set(office, (c.weakOffices.get(office) ?? 0) + 1);
      }
    }
    for (const name of lexiconMatch(r.remarks ?? "")) {
      if (!staged.has(name)) staged.set(name, { derivation: "public_remarks", count: 0 });
      const cur = staged.get(name);
      cur.count++;
    }
  }
  c.builderCandidates = [...staged.entries()].map(([builder_name, v]) => ({ builder_name, ...v }));
}

/* existing rows (never updated — insert-only everywhere) */
const existing = await safeScan("existing communities", () => fetchAllPaged(() => db.from("new_build_communities").select("id, slug")));
const existingBySlug = new Map(existing.map((r) => [r.slug, r.id]));

const report = () => {
  const exact = communities.filter((c) => c.exactVariants.length);
  const prefixOnly = communities.filter((c) => !c.exactVariants.length && c.prefixVariants.length);
  const unmatched = communities.filter((c) => !c.aliases.length);
  console.log(`\nmatch quality: exact ${exact.length} · prefix-only ${prefixOnly.length} · unmatched ${unmatched.length} (of ${communities.length})`);
  for (const c of communities) {
    const flag = c.crossCityHomonyms.length ? ` ⚠ same name also in: ${c.crossCityHomonyms.join(", ")}` : "";
    console.log(`  [${c.city_slug}] ${c.name}: ${c.exactVariants.length} exact + ${c.prefixVariants.length} prefix alias(es) · ${c.builderCandidates.length} builder candidate(s) · ${c.weakOffices.size} weak office name(s) NOT staged${flag}`);
    for (const b of c.builderCandidates) console.log(`      builder [${b.derivation}]: ${b.builder_name} ×${b.count}`);
    for (const v of c.prefixVariants.slice(0, 4)) console.log(`      prefix: "${v}"`);
    for (const [o, n] of [...c.weakOffices.entries()].slice(0, 3)) console.log(`      weak office (report-only): "${o}" ×${n}`);
  }
  const totalAliases = communities.reduce((n, c) => n + c.aliases.length, 0);
  const totalBuilders = communities.reduce((n, c) => n + c.builderCandidates.length, 0);
  console.log(`totals: would insert ${communities.filter((c) => !existingBySlug.has(c.slug)).length} community(ies) · ${totalAliases} alias(es) · ${totalBuilders} builder derivation(s) · already existing (skipped, never updated): ${communities.filter((c) => existingBySlug.has(c.slug)).length}`);
};

if (scanFailed) {
  console.error("REFUSED: database scan failed — nothing written, nothing claimed.");
  process.exitCode = 1;
} else if (DIFF) {
  console.log("--diff (read-only) — nothing written, no job-run row claimed.");
  report();
  process.exitCode = 0;
} else if (APPLY) {
  await runApply();
} else {
  await runStats();
}

async function claimRun(jobName) {
  const { data: run, error } = await db
    .from("content_job_runs")
    .insert({ job_name: jobName, dry_run: false })
    .select("id")
    .single();
  if (error) {
    console.error(
      error.code === "23505"
        ? `REFUSED: another ${jobName} run is in flight (or a crashed run holds the lock).\n` +
            `Release: update content_job_runs set finished_at = now(), status = 'failed' where job_name = '${jobName}' and finished_at is null;`
        : `REFUSED: could not claim job run: ${error.message}`
    );
    return null;
  }
  return run;
}

async function runApply() {
  report();
  const run = await claimRun("seed_new_build_communities");
  if (!run) {
    process.exitCode = 1;
    return;
  }
  let inserted = 0, aliasesIns = 0, buildersIns = 0, skippedExisting = 0, failed = 0;
  const logError = (item_ref, stage, message) =>
    db.from("content_job_errors").insert({ run_id: run.id, item_ref, stage, message: String(message).slice(0, 800) }).then(() => {});
  try {
    for (const c of communities) {
      let communityId = existingBySlug.get(c.slug) ?? null;
      if (communityId) {
        skippedExisting++; // insert-only: human-touched rows are never updated
      } else {
        const { data: row, error } = await db
          .from("new_build_communities")
          .insert({
            slug: c.slug,
            name: c.name,
            city_slug: c.city_slug,
            hood_slug: c.hood_slug,
            county: c.county,
            status: c.status,
            price_from_label: c.price_from_label,
            builders_count: c.builders_count,
            hero_summary: c.hero_summary,
            subdivision_names_json: c.aliases,
            // published=false + verification_status='unverified' are the
            // schema defaults — stated here as the NB-1 contract
          })
          .select("id")
          .single();
        if (error) {
          failed++;
          await logError(c.slug, "community_insert", error.message);
          continue;
        }
        communityId = row.id;
        inserted++;
      }
      for (const alias of c.aliases) {
        const { error } = await db.from("community_aliases").insert({ community_id: communityId, alias, source: "mls_subdivision" });
        if (!error) aliasesIns++;
        else if (error.code !== "23505") { failed++; await logError(`${c.slug}|${alias}`, "alias_insert", error.message); }
      }
      for (const b of c.builderCandidates) {
        const { error } = await db
          .from("community_builders")
          .insert({ community_id: communityId, builder_name: b.builder_name, derivation: b.derivation, source: "local_listings_scan", active_listing_count: b.count });
        if (!error) buildersIns++;
        else if (error.code !== "23505") { failed++; await logError(`${c.slug}|${b.builder_name}`, "builder_insert", error.message); }
      }
    }
  } finally {
    await db
      .from("content_job_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: failed > 0 ? "partial" : "success",
        items_seen: communities.length,
        items_written: inserted + aliasesIns + buildersIns,
        error_summary: failed > 0 ? `${failed} failure(s) — see content_job_errors` : null,
      })
      .eq("id", run.id);
  }
  console.log(`\nAPPLY complete: communities_inserted=${inserted} skipped_existing=${skippedExisting} aliases=${aliasesIns} builders=${buildersIns} failed=${failed} (run ${run.id})`);
  process.exitCode = failed > 0 ? 1 : 0;
}

const median = (nums) => {
  const v = nums.filter((n) => n != null && isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

async function runStats() {
  const run = await claimRun("new_build_inventory_stats");
  if (!run) {
    process.exitCode = 1;
    return;
  }
  let snapshots = 0, failed = 0;
  const thisYear = new Date().getFullYear();
  const readyNow = /\b(ready now|move[- ]in ready|quick move[- ]in|immediate (move|occupancy)|completed?)\b/i;
  try {
    for (const c of communities) {
      const communityId = existingBySlug.get(c.slug);
      if (!communityId || !c.aliases.length) continue;
      const aliasSet = aliasSetFor(c);
      const mine = nbRows.filter((r) => r.city_slug === c.city_slug && aliasSet.has((r.subdivision ?? "").trim()));
      const active = mine.filter((r) => r.standard_status === "Active");
      const pending = mine.filter((r) => r.standard_status === "Pending" || r.standard_status === "ActiveUnderContract");
      const quick = active.filter((r) => (r.year_built ?? 0) >= thisYear && readyNow.test(r.remarks ?? ""));
      const prices = active.map((r) => r.list_price).filter((p) => p > 0);
      const sqfts = active.map((r) => r.living_area).filter((s) => s > 0);
      const ppsf = active.filter((r) => r.list_price > 0 && r.living_area > 0).map((r) => r.list_price / r.living_area);
      const buildersSeen = [...new Set(active.flatMap((r) => lexiconMatch(`${r.list_office ?? ""} ${r.remarks ?? ""}`)))];
      const { error } = await db.from("community_inventory_stats").insert({
        community_id: communityId,
        active_listing_count: active.length,
        pending_listing_count: pending.length,
        quick_move_in_count: quick.length,
        min_price: prices.length ? Math.min(...prices) : null,
        median_price: median(prices),
        max_price: prices.length ? Math.max(...prices) : null,
        median_sqft: median(sqfts),
        median_price_per_sqft: median(ppsf),
        builder_names_seen_json: buildersSeen,
        source: "local_listings",
      });
      if (error) { failed++; console.warn(`  ${c.slug}: snapshot failed — ${error.message}`); }
      else snapshots++;
    }
  } finally {
    await db
      .from("content_job_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: failed > 0 ? "partial" : "success",
        items_seen: communities.length,
        items_written: snapshots,
        error_summary: failed > 0 ? `${failed} failure(s)` : null,
      })
      .eq("id", run.id);
  }
  console.log(`\nSTATS complete: snapshots=${snapshots} failed=${failed} (run ${run.id})`);
  process.exitCode = failed > 0 ? 1 : 0;
}
