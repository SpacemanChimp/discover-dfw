/* Community Builder — draft exporter (Phase CB-2).
 *
 * Turns READY community_drafts rows into exact compact-JSON additions to
 * lib/dfw.data.json — the single source of truth for public pages. The
 * script edits the WORKING TREE only: no git commands, no GitHub API, no
 * external calls (its only network peer is our Supabase). Publishing stays
 * what it is today — a human reviews and merges the resulting branch/PR,
 * and Vercel redeploys the static pages. Nothing here can auto-publish.
 *
 * Privilege tiers (same discipline as the CI/NB seeders):
 *   (default)   OFFLINE — reads lib/dfw.data.json only. No DB, no network.
 *   --diff      READ-ONLY DB — fetches ready drafts, runs the full
 *               validation, prints the LITERAL insertion strings and a
 *               commit-message preview. No writes, no job-run row.
 *   --apply     Splices the file, then stamps drafts exported. Requires
 *               the flag AND CONTENT_INTELLIGENCE_DRY_RUN=false exactly.
 *               Claims the content_job_runs single-flight lock
 *               (job_name 'export_community_drafts').
 *               ORDER OF OPERATIONS (approved amendment): splice → parse/
 *               verify output → write file → ONLY THEN stamp lifecycle=
 *               'exported'. Any earlier failure leaves drafts 'ready' and
 *               the file untouched.
 *   --mark-live POST-MERGE gate (same env requirement): exported → live.
 *               Run only after the data PR merged, deployed, and the new
 *               URLs probed 200 — the script does not probe, it records.
 *   --unexport  Abandoned-PR reset (same env requirement): exported →
 *               ready, exported_at cleared. Refuses on 'live'.
 *
 * Other flags: --slug=<city>/<hood> scopes any DB tier to one draft.
 *
 * Batch policy: FAIL CLOSED. If any eligible draft fails validation the
 * whole run aborts with a per-draft report and nothing is written — the
 * PR a human reviews always matches the diff they approved.
 *
 * Crash-safe recovery: if a prior --apply wrote the file but died before
 * stamping, the re-run classifies a draft whose EXACT entry already sits
 * in the dataset as 'already in dataset — stamp only' instead of a
 * collision, and just stamps it.
 *
 * Collision rules mirror lib/content/community-drafts.ts (the portal's
 * create/update validation) — if you change a rule THERE, change it HERE:
 * same-city slug vs hoods+newBuilds, cross-city NAME reuse anywhere (the
 * flower-mound "Wellington" lesson: newBuildByName() in lib/hoods.ts is
 * name-global), slugifyHood fixed-point, intra-batch duplicates.
 *
 * Never call process.exit() once any client exists (CI-2 lesson).
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_FILE = path.join(ROOT, "lib", "dfw.data.json");

/* ---- pure helpers (exported for fixture tests) --------------------------- */

/* mirrors lib/slug.ts slugifyHood exactly (incl. the & -> " and " rule) */
export function slugifyHood(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const STATUS_LABELS = ["NOW SELLING", "MODELS OPEN", "FINAL PHASE", "SOLD OUT"];
const FROM_SHAPE = /^\$\d{2,4}(s|K|\.\dM)$/;
const NOTE_MAX = 200;
const NAME_MAX = 80;

/** The exact public entry a new_build draft becomes (field order matters —
    it must serialize like every existing newBuilds entry). */
export function newBuildEntry(draft) {
  return {
    name: draft.name,
    city: draft.city_slug,
    from: draft.from_label,
    builders: draft.builders_count,
    status: draft.status_label,
    note: draft.note,
  };
}

/** The exact hoods pair a hood draft becomes. */
export function hoodPair(draft) {
  return [draft.name, draft.note];
}

/** Validate one draft against the CURRENT dataset + the rest of the batch.
    Returns { ok:true, alreadyInDataset:boolean } or { ok:false, reason }. */
export function validateDraft(draft, data, batch) {
  const city = data.cities.find((c) => c.slug === draft.city_slug);
  if (!city) return { ok: false, reason: `unknown city "${draft.city_slug}"` };

  if (draft.type !== "hood" && draft.type !== "new_build")
    return { ok: false, reason: `unknown type "${draft.type}"` };

  const name = String(draft.name ?? "").trim();
  if (!name || name.length > NAME_MAX) return { ok: false, reason: `name required (max ${NAME_MAX} chars)` };
  const note = String(draft.note ?? "").trim();
  if (!note || note.length > NOTE_MAX)
    return { ok: false, reason: `note required (max ${NOTE_MAX} chars) — it is half of a hood pair and the editorial line of a new-build entry` };

  const canonical = slugifyHood(draft.slug ?? "");
  if (!draft.slug || canonical !== draft.slug)
    return { ok: false, reason: `slug "${draft.slug}" is not canonical (expected "${canonical || slugifyHood(name)}")` };

  if (draft.type === "new_build") {
    if (!Number.isInteger(draft.builders_count) || draft.builders_count < 0)
      return {
        ok: false,
        reason:
          "new_build export requires a NUMERIC builders_count (the public NewBuild shape renders a number); a builders_label alone cannot export — set a count in the portal",
      };
    if (!STATUS_LABELS.includes(draft.status_label))
      return { ok: false, reason: `status_label must be one of: ${STATUS_LABELS.join(", ")}` };
    if (!FROM_SHAPE.test(draft.from_label ?? ""))
      return { ok: false, reason: `from_label "${draft.from_label}" must look like "$230s", "$450K" or "$1.2M"` };
  } else {
    // hood entries are [name, note] pairs only — selling fields on a hood
    // draft mean the admin probably meant new_build; refuse, don't guess
    if (draft.status_label || draft.from_label || draft.builders_count != null || draft.builders_label)
      return { ok: false, reason: "hood drafts export as [name, note] only — clear status/from/builders or change the type to new_build" };
  }

  /* crash-safe recovery: the EXACT entry already in the dataset means a
     prior --apply wrote the file but died before stamping — stamp only */
  if (draft.type === "new_build") {
    const existing = data.newBuilds.find((nb) => nb.city === draft.city_slug && slugifyHood(nb.name) === draft.slug);
    if (existing) {
      if (JSON.stringify(existing) === JSON.stringify(newBuildEntry(draft))) return { ok: true, alreadyInDataset: true };
      return { ok: false, reason: `"${draft.city_slug}/${draft.slug}" already renders as the new-build "${existing.name}" (and differs from this draft)` };
    }
  } else {
    const existingPair = city.hoods.find(([n]) => slugifyHood(n) === draft.slug);
    if (existingPair) {
      if (JSON.stringify(existingPair) === JSON.stringify(hoodPair(draft))) return { ok: true, alreadyInDataset: true };
      return { ok: false, reason: `"${draft.city_slug}/${draft.slug}" already renders as the hood "${existingPair[0]}" (and differs from this draft)` };
    }
  }

  // same-city slug collision with the OTHER list (hood draft vs newBuilds, nb draft vs hoods)
  for (const [hoodName] of city.hoods) {
    if (slugifyHood(hoodName) === draft.slug && draft.type === "new_build")
      return { ok: false, reason: `"${draft.city_slug}/${draft.slug}" already renders as the hood "${hoodName}" (incl. the six deferred conversions — blocked until precedence is resolved)` };
  }
  for (const nb of data.newBuilds) {
    if (nb.city === draft.city_slug && slugifyHood(nb.name) === draft.slug && draft.type === "hood")
      return { ok: false, reason: `"${draft.city_slug}/${draft.slug}" already renders as the new-build "${nb.name}"` };
  }

  // cross-city NAME reuse (the Wellington rule — newBuildByName is name-global)
  const key = name.toLowerCase();
  for (const other of data.cities) {
    if (other.slug !== draft.city_slug && other.hoods.some(([n]) => n.toLowerCase() === key))
      return { ok: false, reason: `name "${name}" collides with the existing hood in ${other.name} — cross-city name reuse mis-attaches data (lib/hoods.ts newBuildByName has no city scoping)` };
  }
  const nbHit = data.newBuilds.find((nb) => nb.name.toLowerCase() === key && !(nb.city === draft.city_slug));
  if (nbHit) return { ok: false, reason: `name "${name}" collides with the existing new-build in ${nbHit.city} (cross-city name rule)` };

  // intra-batch duplicates (slug or name)
  for (const other of batch) {
    if (other === draft) continue;
    if (other.city_slug === draft.city_slug && other.slug === draft.slug)
      return { ok: false, reason: `duplicate slug "${draft.city_slug}/${draft.slug}" inside this export batch` };
    if (String(other.name).trim().toLowerCase() === key)
      return { ok: false, reason: `duplicate name "${name}" inside this export batch (cross-city name rule applies within the batch too)` };
  }

  return { ok: true, alreadyInDataset: false };
}

/** Byte-safe splice: replace ONE anchored array segment inside compact raw
    JSON. The segment must start exactly at the anchor key's value position
    and must serialize byte-identically from the parsed data (true for a
    compact JSON.stringify-produced file). Throws on any ambiguity. */
function spliceArrayAt(raw, keyIdxLabel, keyIdx, key, currentArr, nextArr) {
  if (keyIdx < 0) throw new Error(`${keyIdxLabel}: key ${key} not found`);
  const valueStart = keyIdx + key.length;
  const seg = JSON.stringify(currentArr);
  if (!raw.startsWith(seg, valueStart))
    throw new Error(`${keyIdxLabel}: file segment does not match the parsed array byte-for-byte — refusing to splice`);
  return raw.slice(0, valueStart) + JSON.stringify(nextArr) + raw.slice(valueStart + seg.length);
}

/** Append entries to the top-level newBuilds array. */
export function spliceNewBuilds(raw, data, entries) {
  const key = '"newBuilds":';
  const idx = raw.indexOf(key);
  if (idx !== raw.lastIndexOf(key)) throw new Error("newBuilds key is not unique in the file");
  return spliceArrayAt(raw, "newBuilds", idx, key, data.newBuilds, [...data.newBuilds, ...entries]);
}

/** Append [name, note] pairs to ONE city's hoods array. */
export function spliceCityHoods(raw, data, citySlug, pairs) {
  const city = data.cities.find((c) => c.slug === citySlug);
  if (!city) throw new Error(`unknown city ${citySlug}`);
  const marker = `"slug":${JSON.stringify(citySlug)}`;
  const markerIdx = raw.indexOf(marker);
  if (markerIdx < 0) throw new Error(`city marker ${marker} not found`);
  if (raw.indexOf(marker, markerIdx + 1) >= 0) throw new Error(`city marker ${marker} is not unique in the file`);
  const key = '"hoods":';
  const keyIdx = raw.indexOf(key, markerIdx);
  if (keyIdx < 0) throw new Error(`hoods key not found after city marker ${citySlug}`);
  return spliceArrayAt(raw, `hoods(${citySlug})`, keyIdx, key, city.hoods, [...city.hoods, ...pairs]);
}

/** Post-splice verification: output parses, additions are exactly the
    expected ones, and EVERYTHING ELSE is deep-identical to the before
    state. Throws with a reason on any mismatch. */
export function verifySplicedOutput(beforeParsed, outRaw, nbAdds, hoodAddsByCity) {
  const after = JSON.parse(outRaw); // throws if the splice broke the JSON
  if (after.newBuilds.length !== beforeParsed.newBuilds.length + nbAdds.length)
    throw new Error(`newBuilds count ${after.newBuilds.length}, expected ${beforeParsed.newBuilds.length + nbAdds.length}`);
  const strippedNb = after.newBuilds.slice(0, beforeParsed.newBuilds.length);
  const addedNb = after.newBuilds.slice(beforeParsed.newBuilds.length);
  if (JSON.stringify(addedNb) !== JSON.stringify(nbAdds)) throw new Error("newBuilds additions do not match the drafts");

  const strippedCities = after.cities.map((c) => {
    const adds = hoodAddsByCity.get(c.slug);
    if (!adds) return c;
    const kept = c.hoods.slice(0, c.hoods.length - adds.length);
    const added = c.hoods.slice(c.hoods.length - adds.length);
    if (JSON.stringify(added) !== JSON.stringify(adds)) throw new Error(`hood additions for ${c.slug} do not match the drafts`);
    return { ...c, hoods: kept };
  });

  const strippedWhole = { ...after, cities: strippedCities, newBuilds: strippedNb };
  if (JSON.stringify(strippedWhole) !== JSON.stringify(beforeParsed))
    throw new Error("pre-existing data changed — refusing (existing entries must never be touched)");
  return after;
}

/** Full splice pipeline over raw file text. Returns { outRaw, insertions }
    where insertions lists the literal JSON strings added (for --diff and
    the commit body). Pure: touches no file, no DB. */
export function buildExport(raw, drafts) {
  if (raw.charCodeAt(0) === 0xfeff) throw new Error("file has a BOM — refusing");
  if (raw.includes("\u0000")) throw new Error("file contains NUL bytes — refusing");
  const before = JSON.parse(raw);

  const nbDrafts = drafts.filter((d) => d.type === "new_build");
  const hoodDrafts = drafts.filter((d) => d.type === "hood");
  const nbAdds = nbDrafts.map(newBuildEntry);
  const hoodAddsByCity = new Map();
  for (const d of hoodDrafts) {
    const list = hoodAddsByCity.get(d.city_slug) ?? [];
    list.push(hoodPair(d));
    hoodAddsByCity.set(d.city_slug, list);
  }

  let out = raw;
  if (nbAdds.length) out = spliceNewBuilds(out, before, nbAdds);
  // hoods splices run on the updated string; anchors are re-found each time
  // (before's per-city hoods arrays are still the file's current segments —
  // only newBuilds changed above)
  for (const [citySlug, pairs] of hoodAddsByCity) {
    const current = JSON.parse(out);
    out = spliceCityHoods(out, current, citySlug, pairs);
  }

  verifySplicedOutput(before, out, nbAdds, hoodAddsByCity);
  const insertions = [
    ...nbAdds.map((e) => ({ where: "newBuilds", json: JSON.stringify(e) })),
    ...[...hoodAddsByCity.entries()].flatMap(([c, pairs]) => pairs.map((p) => ({ where: `cities[${c}].hoods`, json: JSON.stringify(p) }))),
  ];
  return { outRaw: out, insertions };
}

/** Ready-to-paste commit message body (printed, NEVER committed by us). */
export function commitBody(drafts) {
  const lines = drafts.map((d) =>
    d.type === "new_build"
      ? `- ${d.city_slug}/${d.slug}  ${d.from_label} · ${d.builders_count} builders · ${d.status_label}`
      : `- ${d.city_slug}/${d.slug}  (hood) — ${d.note}`
  );
  return [
    `CB-2 export: add ${drafts.length} community entr${drafts.length === 1 ? "y" : "ies"} from ready drafts`,
    "",
    ...lines,
    "",
    "Data-only change to lib/dfw.data.json from the Community Builder",
    "(admin-drafted, exported via the gated CB-2 exporter; collisions",
    "re-audited at export time incl. the cross-city name rule). Pages,",
    "sitemap and city rosters generate via the existing hoodsForCity()",
    "union — no code changes.",
    "",
    "Validation: build clean with +N static pages; sitemap +N with no",
    "collapsed canonical; existing entries byte-identical (verified",
    "programmatically before write); JSON parses, compact single-line",
    "formatting preserved.",
  ].join("\n");
}

/* ---- CLI ------------------------------------------------------------------ */

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const argv = process.argv.slice(2);
  const DIFF = argv.includes("--diff");
  const APPLY = argv.includes("--apply");
  const MARK_LIVE = argv.includes("--mark-live");
  const UNEXPORT = argv.includes("--unexport");
  const slugArg = (argv.find((a) => a.startsWith("--slug=")) ?? "").split("=")[1] || "";

  const modes = [DIFF, APPLY, MARK_LIVE, UNEXPORT].filter(Boolean).length;
  if (modes > 1) {
    console.error("REFUSED: pick exactly one of --diff / --apply / --mark-live / --unexport.");
    process.exit(1);
  }
  if ((APPLY || MARK_LIVE || UNEXPORT) && process.env.CONTENT_INTELLIGENCE_DRY_RUN !== "false") {
    console.error(
      "REFUSED: --apply / --mark-live / --unexport write (file and/or database).\n" +
        "Each requires CONTENT_INTELLIGENCE_DRY_RUN=false (exactly). Unset or any other value refuses."
    );
    process.exit(1);
  }

  const raw = readFileSync(DATA_FILE, "utf8");
  const data = JSON.parse(raw);

  if (modes === 0) {
    // OFFLINE default: no DB, no network
    console.log("CB-2 draft exporter — offline config");
    console.log(`  data file: lib/dfw.data.json (${raw.length} chars, ${data.cities.length} cities, ${data.newBuilds.length} newBuilds)`);
    console.log("  tiers: --diff (read-only DB) | --apply (file+DB; env-gated) | --mark-live | --unexport (DB; env-gated)");
    console.log("  scope: --slug=<city>/<hood>");
    console.log("  gates: every tier beyond --diff is separately approved; the resulting branch/PR is reviewed by a human;");
    console.log("         drafts stamp 'exported' only AFTER the splice + post-splice validation succeed;");
    console.log("         'live' is stamped only by --mark-live after the merge deployed and URLs probed 200.");
    process.exit(0);
  }

  /* DB tiers from here down */
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    console.error("REFUSED: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY not set.");
    process.exit(1);
  }
  const db = createClient(url, secret);
  // never process.exit() after this point (CI-2 libuv lesson) — exitCode only

  const wantedLifecycle = MARK_LIVE || UNEXPORT ? "exported" : "ready";

  async function fetchDrafts() {
    let q = db
      .from("community_drafts")
      .select("id, type, name, city_slug, slug, status_label, from_label, builders_count, builders_label, note, lifecycle, ready_for_export")
      .eq("lifecycle", wantedLifecycle)
      .order("city_slug")
      .order("name");
    if (wantedLifecycle === "ready") q = q.eq("ready_for_export", true);
    if (slugArg) {
      const [c, s] = slugArg.split("/");
      q = q.eq("city_slug", c ?? "").eq("slug", s ?? "");
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(`could not read community_drafts: ${error.message}`);
    return rows ?? [];
  }

  async function audit(action, d, notes) {
    const { error } = await db.from("verification_events").insert({
      entity_type: "community_draft",
      entity_slug: `${d.city_slug}/${d.slug}`,
      verified_by: "cb2-exporter",
      verification_method: "admin_review",
      action,
      notes,
    });
    if (error) console.warn(`  audit row failed for ${d.city_slug}/${d.slug}: ${error.message}`);
  }

  async function claimRun() {
    const { data: run, error } = await db
      .from("content_job_runs")
      .insert({ job_name: "export_community_drafts", dry_run: false })
      .select("id")
      .single();
    if (error) {
      console.error(
        error.code === "23505"
          ? "REFUSED: another export_community_drafts run is in flight (or a crashed run holds the lock).\n" +
              "Release: update content_job_runs set finished_at = now(), status = 'failed' where job_name = 'export_community_drafts' and finished_at is null;"
          : `REFUSED: could not claim job run: ${error.message}`
      );
      return null;
    }
    return run;
  }

  async function finishRun(run, status, seen, written, errorSummary) {
    await db
      .from("content_job_runs")
      .update({ finished_at: new Date().toISOString(), status, items_seen: seen, items_written: written, error_summary: errorSummary })
      .eq("id", run.id);
  }

  function validateBatch(drafts) {
    const results = drafts.map((d) => ({ draft: d, verdict: validateDraft(d, data, drafts) }));
    for (const r of results) {
      const tag = r.verdict.ok ? (r.verdict.alreadyInDataset ? "STAMP-ONLY (already in dataset)" : "OK") : `FAIL — ${r.verdict.reason}`;
      console.log(`  [${r.draft.type}] ${r.draft.city_slug}/${r.draft.slug}: ${tag}`);
    }
    return results;
  }

  try {
    if (DIFF) {
      const drafts = await fetchDrafts();
      console.log(`--diff (read-only) — ${drafts.length} ready draft(s)${slugArg ? ` scoped to ${slugArg}` : ""}. Nothing written, no job-run row claimed.\n`);
      if (!drafts.length) {
        console.log("No eligible drafts.");
      } else {
        const results = validateBatch(drafts);
        const failed = results.filter((r) => !r.verdict.ok);
        if (failed.length) {
          console.error(`\nBATCH FAILS CLOSED: ${failed.length} draft(s) invalid — fix or archive them, then re-run.`);
          process.exitCode = 1;
        } else {
          const toSplice = results.filter((r) => !r.verdict.alreadyInDataset).map((r) => r.draft);
          const stampOnly = results.length - toSplice.length;
          if (toSplice.length) {
            const { insertions } = buildExport(raw, toSplice);
            console.log("\nexact insertions:");
            for (const ins of insertions) console.log(`  -> ${ins.where}: ${ins.json}`);
          }
          if (stampOnly) console.log(`\n${stampOnly} draft(s) already in the dataset would be stamped exported only.`);
          console.log(`\nwould update lifecycle ready -> exported for ${results.length} draft(s) on --apply`);
          console.log("\n--- commit message preview -------------------------------------------");
          console.log(commitBody(drafts));
          console.log("----------------------------------------------------------------------");
        }
      }
    } else if (APPLY) {
      const drafts = await fetchDrafts();
      if (!drafts.length) {
        console.log("APPLY: no eligible drafts — nothing to do.");
      } else {
        const results = validateBatch(drafts);
        const failed = results.filter((r) => !r.verdict.ok);
        if (failed.length) {
          console.error(`\nBATCH FAILS CLOSED: ${failed.length} draft(s) invalid — nothing written, all drafts remain 'ready'.`);
          process.exitCode = 1;
        } else {
          const run = await claimRun();
          if (!run) {
            process.exitCode = 1;
          } else {
            let stamped = 0, stampFailed = 0;
            try {
              const toSplice = results.filter((r) => !r.verdict.alreadyInDataset).map((r) => r.draft);
              if (toSplice.length) {
                const { outRaw, insertions } = buildExport(raw, toSplice); // splice + verify; throws on any problem
                writeFileSync(DATA_FILE, outRaw, "utf8");
                console.log(`\nfile spliced: ${raw.length} -> ${outRaw.length} chars, ${insertions.length} insertion(s)`);
              } else {
                console.log("\nno splice needed (all drafts already in the dataset) — stamping only");
              }
              // ONLY after a successful write do lifecycles move (approved amendment)
              for (const { draft } of results) {
                const { error } = await db
                  .from("community_drafts")
                  .update({ lifecycle: "exported", exported_at: new Date().toISOString() })
                  .eq("id", draft.id)
                  .eq("lifecycle", "ready");
                if (error) {
                  stampFailed++;
                  console.error(`  stamp failed for ${draft.city_slug}/${draft.slug}: ${error.message} — re-run --apply --slug=${draft.city_slug}/${draft.slug} (it will classify as stamp-only)`);
                } else {
                  stamped++;
                  await audit("update", draft, `exported: run ${run.id}`);
                }
              }
              console.log(`\nAPPLY complete: spliced=${results.filter((r) => !r.verdict.alreadyInDataset).length} stamped=${stamped} stamp_failed=${stampFailed} (run ${run.id})`);
              console.log("\nNEXT (human-gated): review the working-tree diff, commit on a fresh branch, push, open the PR.");
              console.log("--- ready-to-paste commit message ------------------------------------");
              console.log(commitBody(drafts));
              console.log("----------------------------------------------------------------------");
              await finishRun(run, stampFailed ? "partial" : "success", drafts.length, stamped, stampFailed ? `${stampFailed} stamp failure(s)` : null);
              process.exitCode = stampFailed ? 1 : 0;
            } catch (e) {
              console.error(`\nAPPLY ABORTED before any lifecycle change: ${e.message}`);
              console.error("The data file was NOT modified unless 'file spliced' printed above; drafts remain 'ready'.");
              await finishRun(run, "failed", drafts.length, stamped, String(e.message).slice(0, 400));
              process.exitCode = 1;
            }
          }
        }
      }
    } else if (MARK_LIVE || UNEXPORT) {
      const drafts = await fetchDrafts();
      if (!drafts.length) {
        console.log(`${MARK_LIVE ? "MARK-LIVE" : "UNEXPORT"}: no 'exported' drafts${slugArg ? ` matching ${slugArg}` : ""} — nothing to do.`);
      } else {
        const run = await claimRun();
        if (!run) {
          process.exitCode = 1;
        } else {
          let done = 0, failedN = 0;
          const patch = MARK_LIVE
            ? { lifecycle: "live", live_at: new Date().toISOString() }
            : { lifecycle: "ready", exported_at: null };
          for (const d of drafts) {
            const { error } = await db.from("community_drafts").update(patch).eq("id", d.id).eq("lifecycle", "exported");
            if (error) {
              failedN++;
              console.error(`  ${d.city_slug}/${d.slug}: ${error.message}`);
            } else {
              done++;
              await audit("update", d, MARK_LIVE ? `confirmed live post-merge (run ${run.id})` : `unexported — PR abandoned (run ${run.id})`);
              console.log(`  ${d.city_slug}/${d.slug}: ${MARK_LIVE ? "exported -> live" : "exported -> ready"}`);
            }
          }
          await finishRun(run, failedN ? "partial" : "success", drafts.length, done, failedN ? `${failedN} failure(s)` : null);
          console.log(`\n${MARK_LIVE ? "MARK-LIVE" : "UNEXPORT"} complete: updated=${done} failed=${failedN} (run ${run.id})`);
          process.exitCode = failedN ? 1 : 0;
        }
      }
    }
  } catch (e) {
    console.error(`FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}
