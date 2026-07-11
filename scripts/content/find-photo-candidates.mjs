/* Content Intelligence Loop — photo candidate finder (Phase CI-4).
 *
 * Searches license-safe providers for each seeded photo slot and stages
 * results into photo_candidates (status='pending', license_verified=false)
 * for HUMAN review. Nothing here publishes: photo_assets is never touched,
 * no 'approved' status is ever written, and no public surface reads the
 * candidates table.
 *
 * Privilege tiers (strictly ordered):
 *   (default)   OFFLINE — no DB, no network. Prints config: providers
 *               armed by env, caps, filters, gates.
 *   --diff      READ-ONLY DB — eligible slots + existing candidate counts.
 *               No provider calls, no writes, no job-run row.
 *   --sample=N  LIVE provider calls for N slots (default 2); prints the
 *               normalized candidates in full; WRITES NOTHING. External
 *               calls are privileged: requires CONTENT_INTELLIGENCE_DRY_RUN
 *               set to exactly "false".
 *   --apply     Inserts candidates + flips slot status missing→
 *               candidates_found (only for slots that actually end up with
 *               a pending candidate). Requires the flag AND
 *               CONTENT_INTELLIGENCE_DRY_RUN=false exactly. Claims the
 *               content_job_runs single-flight lock.
 *
 * Other flags: --limit=N (slots per run; apply defaults to 25),
 *              --only=<city-slug> (city + its hoods + its homepage pick),
 *              --provider=<wikimedia|openverse|pexels|unsplash>.
 *
 * Providers (verified against official docs 2026-07-11):
 *   wikimedia  keyless; REQUIRES a descriptive User-Agent per policy
 *              ("Name/ver (url; email)") — missing/generic UAs get 403s.
 *              generator=search + prop=imageinfo(extmetadata) carries
 *              LicenseShortName/LicenseUrl/Artist; descriptionurl is the
 *              file page (source_page_url). Geosearch fallback on lat/lon.
 *   openverse  keyless; anonymous limits burst 20/min + 200/day sustained
 *              (full sweeps must batch across runs/days). Returns license,
 *              creator, foreign_landing_url and a PRE-FORMATTED
 *              `attribution` string — stored verbatim.
 *   pexels     PEXELS_API_KEY via plain Authorization header; 200/hr,
 *              20k/mo. Pexels License. photo.url is the photo page.
 *   unsplash   UNSPLASH_ACCESS_KEY via "Authorization: Client-ID …";
 *              demo 50/hr. Unsplash License REQUIRES hotlinking the API
 *              urls and a GET to links.download_location when a photo is
 *              used — both preserved in evidence for the CI-6 publish step.
 *   google_places — NO CLIENT CODE SHIPS IN v1. The env flag is read only
 *              to print DISABLED; setting it true is ignored with a warning.
 *
 * Never call process.exit() once any client exists (CI-2 lesson: it races
 * libuv teardown on Windows) — set process.exitCode and drain.
 */
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const DIFF = argv.includes("--diff");
const sampleArg = argv.find((a) => a === "--sample" || a.startsWith("--sample="));
const SAMPLE = sampleArg ? Number(sampleArg.split("=")[1]) || 2 : 0;
const limit = Number((argv.find((a) => a.startsWith("--limit=")) ?? "").split("=")[1]) || (APPLY ? 25 : 0);
const only = (argv.find((a) => a.startsWith("--only=")) ?? "").split("=")[1] || "";
const providerFilter = (argv.find((a) => a.startsWith("--provider=")) ?? "").split("=")[1] || "";

if ((APPLY || SAMPLE > 0) && process.env.CONTENT_INTELLIGENCE_DRY_RUN !== "false") {
  console.error(
    "REFUSED: --apply and --sample make external provider calls" +
      (APPLY ? " and database writes" : "") +
      ".\nBoth require CONTENT_INTELLIGENCE_DRY_RUN=false (exactly). Unset or any other value refuses."
  );
  process.exit(1);
}

/* ---- caps & filters (amendment 1: 8 is a HARD per-slot ceiling) -------- */
const PER_SLOT_TOTAL_CAP = 8; // max pending candidates a slot may hold, ever
const PER_PROVIDER_PER_SLOT = 4; // diversity bound inside the ceiling
const MIN_WIDTH = 1200;
const RESULTS_PER_QUERY = 8; // fetched per provider before filtering

// allowlist enforced at ingest — NC/ND/unknown never reach the table
const OPENVERSE_LICENSES = "by,by-sa,cc0,pdm";
const okWikimediaLicense = (s) =>
  /^(public domain|pd|no restrictions|cc0)/i.test(s ?? "") ||
  (/^cc[ -]by(\b|[ -]sa\b)/i.test(s ?? "") && !/nc|nd/i.test(s ?? ""));
const okOpenverseLicense = (s) => ["by", "by-sa", "cc0", "pdm"].includes((s ?? "").toLowerCase());

const SPACING_MS = { wikimedia: 1000, openverse: 3200, pexels: 500, unsplash: 1000 };

const truncate = (s, n = 500) => (typeof s === "string" && s.length > n ? s.slice(0, n) + "…" : s);
const stripHtml = (s) => (s ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

/* ---- paced fetch with retries ------------------------------------------ */
const lastCall = {};
async function pacedFetchJson(providerName, url, headers) {
  const wait = (lastCall[providerName] ?? 0) + SPACING_MS[providerName] - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt === 1 ? 1000 : 4000));
    lastCall[providerName] = Date.now();
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        if (retryAfter > 0 && retryAfter <= 60) await new Promise((r) => setTimeout(r, retryAfter * 1000));
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/* ---- providers ---------------------------------------------------------- */
/* Each returns normalized candidates:
   { source, external_id, image_url, thumbnail_url, source_page_url,
     photographer, attribution_text, attribution_html, license,
     license_url, width, height, raw } — raw is the PRUNED per-result
   evidence (allowlisted response fields + provider/query/retrieved_at;
   never request headers, never keys). */

const wikimedia = {
  name: "wikimedia",
  enabled: () => Boolean(process.env.WIKIMEDIA_USER_AGENT),
  disabledReason: "WIKIMEDIA_USER_AGENT not set (UA policy requires it)",
  async search(slot) {
    const headers = { "User-Agent": process.env.WIKIMEDIA_USER_AGENT };
    const base = "https://commons.wikimedia.org/w/api.php";
    const common =
      "&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=640&format=json&formatversion=2&maxlag=5";
    let data = await pacedFetchJson(
      "wikimedia",
      `${base}?action=query&generator=search&gsrsearch=${encodeURIComponent(slot.search_query ?? slot.label)}&gsrnamespace=6&gsrlimit=${RESULTS_PER_QUERY}${common}`,
      headers
    );
    let pages = data?.query?.pages ?? [];
    // thin text results + we have coordinates → geosearch fallback
    if (pages.length < 2 && slot.latitude != null && slot.longitude != null) {
      data = await pacedFetchJson(
        "wikimedia",
        `${base}?action=query&generator=geosearch&ggscoord=${slot.latitude}|${slot.longitude}&ggsradius=10000&ggsnamespace=6&ggslimit=${RESULTS_PER_QUERY}${common}`,
        headers
      );
      pages = pages.concat(data?.query?.pages ?? []);
    }
    const out = [];
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      const meta = ii?.extmetadata ?? {};
      const licenseShort = meta.LicenseShortName?.value ?? "";
      if (!ii?.url || !ii.descriptionurl || !okWikimediaLicense(licenseShort)) continue;
      const artist = stripHtml(meta.Artist?.value) || "UNKNOWN";
      out.push({
        source: "wikimedia",
        external_id: String(p.pageid ?? p.title),
        image_url: ii.url,
        thumbnail_url: ii.thumburl ?? null,
        source_page_url: ii.descriptionurl,
        photographer: artist,
        attribution_text: `PHOTO: ${artist.toUpperCase()} / WIKIMEDIA COMMONS (${licenseShort.toUpperCase()})`,
        attribution_html: meta.Artist?.value ? truncate(meta.Artist.value) : null,
        license: licenseShort,
        license_url: meta.LicenseUrl?.value ?? null,
        width: ii.width ?? null,
        height: ii.height ?? null,
        raw: {
          title: p.title,
          pageid: p.pageid,
          descriptionurl: ii.descriptionurl,
          url: ii.url,
          width: ii.width,
          height: ii.height,
          extmetadata: {
            LicenseShortName: truncate(meta.LicenseShortName?.value),
            LicenseUrl: truncate(meta.LicenseUrl?.value),
            UsageTerms: truncate(meta.UsageTerms?.value),
            Artist: truncate(meta.Artist?.value),
            Credit: truncate(meta.Credit?.value),
            ImageDescription: truncate(meta.ImageDescription?.value),
          },
        },
      });
    }
    return out;
  },
};

const openverse = {
  name: "openverse",
  enabled: () => Boolean(process.env.OPENVERSE_CONTACT_EMAIL),
  disabledReason: "OPENVERSE_CONTACT_EMAIL not set (identifies us in the UA)",
  async search(slot) {
    const headers = {
      "User-Agent": `DiscoverDFWContentBot/1.0 (${process.env.OPENVERSE_CONTACT_EMAIL})`,
    };
    const data = await pacedFetchJson(
      "openverse",
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(slot.search_query ?? slot.label)}&license=${OPENVERSE_LICENSES}&page_size=${RESULTS_PER_QUERY}`,
      headers
    );
    const out = [];
    for (const r of data?.results ?? []) {
      if (!r.url || !r.foreign_landing_url || !okOpenverseLicense(r.license)) continue;
      const licenseLabel = r.license === "pdm" ? "Public Domain Mark" : r.license === "cc0" ? "CC0" : `CC ${r.license.toUpperCase()} ${r.license_version ?? ""}`.trim();
      out.push({
        source: "openverse",
        external_id: r.id,
        image_url: r.url,
        thumbnail_url: r.thumbnail ?? null,
        source_page_url: r.foreign_landing_url,
        photographer: r.creator ?? "UNKNOWN",
        // Openverse ships a pre-formatted legal credit — keep it verbatim
        attribution_text: r.attribution ?? `PHOTO: ${(r.creator ?? "UNKNOWN").toUpperCase()} / OPENVERSE (${licenseLabel})`,
        attribution_html: null,
        license: licenseLabel,
        license_url: r.license_url ?? null,
        width: r.width ?? null,
        height: r.height ?? null,
        raw: {
          id: r.id,
          title: truncate(r.title),
          url: r.url,
          foreign_landing_url: r.foreign_landing_url,
          license: r.license,
          license_version: r.license_version,
          license_url: r.license_url,
          creator: truncate(r.creator),
          creator_url: r.creator_url,
          attribution: truncate(r.attribution),
          width: r.width,
          height: r.height,
          source: r.source,
          provider: r.provider,
        },
      });
    }
    return out;
  },
};

const pexels = {
  name: "pexels",
  enabled: () => Boolean(process.env.PEXELS_API_KEY),
  disabledReason: "PEXELS_API_KEY not set",
  async search(slot) {
    const data = await pacedFetchJson(
      "pexels",
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(slot.search_query ?? slot.label)}&orientation=${slot.preferred_orientation ?? "landscape"}&per_page=${RESULTS_PER_QUERY}`,
      { Authorization: process.env.PEXELS_API_KEY }
    );
    return (data?.photos ?? [])
      .filter((r) => r.src?.original && r.url)
      .map((r) => ({
        source: "pexels",
        external_id: String(r.id),
        image_url: r.src.original,
        thumbnail_url: r.src.medium ?? null,
        source_page_url: r.url,
        photographer: r.photographer ?? "UNKNOWN",
        attribution_text: `PHOTO: ${(r.photographer ?? "UNKNOWN").toUpperCase()} / PEXELS`,
        attribution_html: null,
        license: "Pexels License",
        license_url: "https://www.pexels.com/license/",
        width: r.width ?? null,
        height: r.height ?? null,
        raw: {
          id: r.id,
          url: r.url,
          photographer: truncate(r.photographer),
          photographer_url: r.photographer_url,
          alt: truncate(r.alt),
          width: r.width,
          height: r.height,
          src: { original: r.src.original, large: r.src.large },
        },
      }));
  },
};

const unsplash = {
  name: "unsplash",
  enabled: () => Boolean(process.env.UNSPLASH_ACCESS_KEY),
  disabledReason: "UNSPLASH_ACCESS_KEY not set",
  async search(slot) {
    const data = await pacedFetchJson(
      "unsplash",
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(slot.search_query ?? slot.label)}&orientation=${(slot.preferred_orientation ?? "landscape") === "square" ? "squarish" : slot.preferred_orientation ?? "landscape"}&content_filter=high&per_page=${RESULTS_PER_QUERY}`,
      { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }
    );
    return (data?.results ?? [])
      .filter((r) => r.urls?.regular && r.links?.html)
      .map((r) => ({
        source: "unsplash",
        external_id: r.id,
        // Unsplash REQUIRES hotlinking the API-returned URLs
        image_url: r.urls.regular,
        thumbnail_url: r.urls.small ?? null,
        source_page_url: r.links.html,
        photographer: r.user?.name ?? "UNKNOWN",
        attribution_text: `PHOTO: ${(r.user?.name ?? "UNKNOWN").toUpperCase()} / UNSPLASH`,
        attribution_html: null,
        license: "Unsplash License",
        license_url: "https://unsplash.com/license",
        width: r.width ?? null,
        height: r.height ?? null,
        raw: {
          id: r.id,
          description: truncate(r.description),
          alt_description: truncate(r.alt_description),
          width: r.width,
          height: r.height,
          urls: { raw: r.urls.raw, regular: r.urls.regular, small: r.urls.small },
          // CI-6 publish obligations: hotlink + GET download_location on use
          links: { html: r.links.html, download_location: r.links.download_location },
          user: { name: truncate(r.user?.name), username: r.user?.username, html: r.user?.links?.html },
        },
      }));
  },
};

const PROVIDERS = [wikimedia, openverse, pexels, unsplash].filter(
  (p) => !providerFilter || p.name === providerFilter
);

/* ---- shared filtering --------------------------------------------------- */
function passesQuality(c, slot) {
  if (!c.image_url || !c.source_page_url) return false;
  if (c.width != null && c.width < MIN_WIDTH) return false;
  if (c.width != null && c.height != null) {
    const o = slot.preferred_orientation ?? "landscape";
    if (o === "landscape" && c.width <= c.height) return false;
    if (o === "portrait" && c.height <= c.width) return false;
    if (o === "square" && Math.abs(c.width / c.height - 1) > 0.1) return false;
  }
  return true;
}

const dedupeKey = (c) => c.source_page_url || `${c.source}:${c.external_id}`;

function evidenceFor(slot, c) {
  const evidence = {
    provider: c.source,
    query: slot.search_query ?? slot.label,
    retrieved_at: new Date().toISOString(),
    result: c.raw,
  };
  // bounded: evidence is allowlisted fields only, but guard size anyway
  return JSON.stringify(evidence).length > 16000
    ? { provider: c.source, query: evidence.query, retrieved_at: evidence.retrieved_at, result: { id: c.external_id, note: "evidence truncated — exceeded 16k bound" } }
    : evidence;
}

const matchesOnly = (slug) => !only || slug === only || slug.startsWith(only + "/");

/* ---- offline default tier ----------------------------------------------- */
function printConfig() {
  console.log("providers:");
  for (const p of [wikimedia, openverse, pexels, unsplash])
    console.log(`  ${p.name.padEnd(10)} ${p.enabled() ? "ARMED" : `disarmed — ${p.disabledReason}`}`);
  console.log("  google_places DISABLED (v1 ships no Places client)");
  if (process.env.CONTENT_ENABLE_GOOGLE_PLACES === "true")
    console.warn("  WARNING: CONTENT_ENABLE_GOOGLE_PLACES=true is IGNORED — no code path exists in v1.");
  console.log(`caps: ${PER_SLOT_TOTAL_CAP} pending/slot (hard ceiling) · ${PER_PROVIDER_PER_SLOT}/provider/slot · min width ${MIN_WIDTH}px · orientation must match slot`);
  console.log(`licenses at ingest: PD / CC0 / CC-BY / CC-BY-SA · Pexels License · Unsplash License (NC/ND/unknown dropped)`);
  console.log(`pacing ms/call: ${JSON.stringify(SPACING_MS)} · retries: 2 (1s/4s backoff, honors Retry-After)`);
}

if (!DIFF && !APPLY && SAMPLE === 0) {
  console.log("DRY RUN (offline) — no database, no network.");
  printConfig();
  console.log(
    "Next tiers: --diff (read-only DB) · --sample=N (live provider calls, writes nothing) · --apply (writes; both need CONTENT_INTELLIGENCE_DRY_RUN=false)"
  );
  process.exit(0);
}

/* ---- DB tiers from here -------------------------------------------------- */
const { createClient } = await import("@supabase/supabase-js");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("REFUSED: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY not set.");
  process.exit(1); // no client exists yet — plain exit is safe here
}
const db = createClient(url, secret);

async function fetchAllPaged(builderFactory) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await builderFactory().range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

const allSlots = await fetchAllPaged(() =>
  db
    .from("photo_slots")
    .select("id, entity_type, entity_slug, slot_key, label, search_query, preferred_orientation, required_place_name, latitude, longitude, status, label_source")
    .in("status", ["missing", "candidates_found"])
    .order("entity_slug")
);

const pendingRows = await fetchAllPaged(() =>
  db.from("photo_candidates").select("photo_slot_id, source, source_page_url, external_id").eq("status", "pending")
);
const pendingCount = new Map();
const existingKeys = new Set();
for (const r of pendingRows) {
  pendingCount.set(r.photo_slot_id, (pendingCount.get(r.photo_slot_id) ?? 0) + 1);
  existingKeys.add(`${r.photo_slot_id}|${r.source_page_url || `${r.source}:${r.external_id}`}`);
}

let eligible = allSlots.filter(
  (s) => matchesOnly(s.entity_slug) && (pendingCount.get(s.id) ?? 0) < PER_SLOT_TOTAL_CAP
);
// curated labels make better queries — search those first
eligible.sort((a, b) => (a.label_source === b.label_source ? 0 : a.label_source === "explicit" ? -1 : 1));
const atCapacity = allSlots.filter((s) => matchesOnly(s.entity_slug) && (pendingCount.get(s.id) ?? 0) >= PER_SLOT_TOTAL_CAP);
if (limit > 0) eligible = eligible.slice(0, limit);

if (DIFF && !APPLY) {
  console.log("--diff (read-only) — no provider calls, nothing written, no job-run row claimed.");
  printConfig();
  const byType = {};
  for (const s of eligible) byType[s.entity_type] = (byType[s.entity_type] ?? 0) + 1;
  console.log(`eligible slots: ${eligible.length} ${JSON.stringify(byType)} · at capacity (>=${PER_SLOT_TOTAL_CAP} pending): ${atCapacity.length} · existing pending candidates: ${pendingRows.length}`);
  for (const s of eligible.slice(0, 8))
    console.log(`  [${s.entity_type}] ${s.entity_slug} · ${s.slot_key} · pending ${pendingCount.get(s.id) ?? 0} · q="${s.search_query}"`);
  process.exitCode = 0;
} else {
  await runSearch();
}

/* ---- --sample and --apply ------------------------------------------------ */
async function runSearch() {
  const armed = PROVIDERS.filter((p) => p.enabled());
  if (armed.length === 0) {
    console.error("REFUSED: no providers armed (check env keys / UA vars).");
    process.exitCode = 1;
    return;
  }

  const slots = SAMPLE > 0 ? eligible.slice(0, SAMPLE) : eligible;
  let run = null;
  if (APPLY) {
    const { data, error: claimErr } = await db
      .from("content_job_runs")
      .insert({ job_name: "find_photo_candidates", dry_run: false })
      .select("id")
      .single();
    if (claimErr) {
      console.error(
        claimErr.code === "23505"
          ? "REFUSED: another find_photo_candidates run is in flight (or a crashed run holds the lock).\n" +
              "Release: update content_job_runs set finished_at = now(), status = 'failed' " +
              "where job_name = 'find_photo_candidates' and finished_at is null;"
          : `REFUSED: could not claim job run: ${claimErr.message}`
      );
      process.exitCode = 1;
      return;
    }
    run = data;
  } else {
    console.log(`--sample=${SAMPLE} — live provider calls, WRITES NOTHING, no job-run row claimed.`);
  }

  const logError = (item_ref, stage, message) =>
    run
      ? db.from("content_job_errors").insert({ run_id: run.id, item_ref, stage, message: truncate(message, 800) }).then(() => {})
      : Promise.resolve();

  let inserted = 0, duplicates = 0, rejectedFilters = 0, failed = 0, slotsFlipped = 0;
  try {
    for (const slot of slots) {
      const staged = [];
      const seen = new Set();
      for (const provider of armed) {
        let results;
        try {
          results = await provider.search(slot);
        } catch (e) {
          failed++;
          console.warn(`  ${provider.name} failed on ${slot.entity_slug}/${slot.slot_key}: ${e.message}`);
          await logError(`${slot.entity_type}/${slot.entity_slug}/${slot.slot_key}`, provider.name, e.message);
          continue;
        }
        let kept = 0;
        for (const c of results) {
          if (kept >= PER_PROVIDER_PER_SLOT) break;
          if (!passesQuality(c, slot)) { rejectedFilters++; continue; }
          const key = dedupeKey(c);
          if (seen.has(key) || existingKeys.has(`${slot.id}|${key}`)) { duplicates++; continue; }
          seen.add(key);
          staged.push(c);
          kept++;
        }
      }
      // amendment 1: hard per-slot ceiling — respect remaining capacity
      const capacity = PER_SLOT_TOTAL_CAP - (pendingCount.get(slot.id) ?? 0);
      const toInsert = staged.slice(0, Math.max(0, capacity));

      if (SAMPLE > 0) {
        console.log(`\n[${slot.entity_type}] ${slot.entity_slug} · ${slot.slot_key} · q="${slot.search_query}" → ${toInsert.length} candidate(s) (capacity ${capacity})`);
        for (const c of toInsert)
          console.log(
            `  ${c.source} · ${c.width}x${c.height} · ${c.license}\n    ${c.attribution_text}\n    page: ${c.source_page_url}\n    img:  ${c.image_url}`
          );
        continue;
      }

      let slotInserted = 0;
      for (const c of toInsert) {
        const { error } = await db.from("photo_candidates").insert({
          photo_slot_id: slot.id,
          source: c.source,
          external_id: c.external_id,
          image_url: c.image_url,
          thumbnail_url: c.thumbnail_url,
          source_page_url: c.source_page_url,
          photographer: c.photographer,
          attribution_text: c.attribution_text,
          attribution_html: c.attribution_html,
          license: c.license,
          license_url: c.license_url,
          width: c.width,
          height: c.height,
          raw_api_response: evidenceFor(slot, c),
          // status + license_verified ride the schema defaults:
          // 'pending' and false. This script never writes either field.
        });
        if (!error) { inserted++; slotInserted++; }
        else if (error.code === "23505") duplicates++;
        else { failed++; await logError(`${slot.entity_type}/${slot.entity_slug}/${slot.slot_key}`, "insert", error.message); }
      }
      pendingCount.set(slot.id, (pendingCount.get(slot.id) ?? 0) + slotInserted);

      // amendment 2: flip ONLY slots that actually hold >=1 pending candidate
      if (slot.status === "missing" && (pendingCount.get(slot.id) ?? 0) > 0) {
        const { error } = await db
          .from("photo_slots")
          .update({ status: "candidates_found" })
          .eq("id", slot.id)
          .eq("status", "missing");
        if (!error) slotsFlipped++;
        else { failed++; await logError(`${slot.entity_type}/${slot.entity_slug}/${slot.slot_key}`, "status_flip", error.message); }
      }
    }
  } finally {
    if (run)
      await db
        .from("content_job_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: failed > 0 ? "partial" : "success",
          items_seen: slots.length,
          items_written: inserted,
          error_summary: failed > 0 ? `${failed} failure(s) — see content_job_errors` : null,
        })
        .eq("id", run.id);
  }

  if (SAMPLE > 0) console.log(`\nSAMPLE complete: ${slots.length} slot(s) searched, nothing written.`);
  else console.log(`APPLY complete: slots=${slots.length} inserted=${inserted} duplicates=${duplicates} filtered_out=${rejectedFilters} slots_flipped=${slotsFlipped} failed=${failed} (run ${run.id})`);
  process.exitCode = failed > 0 ? 1 : 0;
}
