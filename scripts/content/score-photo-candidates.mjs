/* Content Intelligence Loop — candidate scorer (Phase CI-5).
 *
 * Fills confidence_score (0-100) + claude_notes on PENDING photo_candidates
 * so the CI-6 review queue sorts signal-first. Metadata-only in v1: the
 * model judges slot context vs candidate title/description/categories/
 * photographer/license/dimensions — no image bytes are fetched or sent.
 * It NEVER changes status, never touches photo_assets, never publishes.
 *
 * Tiers (same discipline as the finder):
 *   (default)  OFFLINE — prints rubric/config; no DB, no SDK, no network.
 *   --diff     READ-ONLY DB — unscored counts by type/source + request
 *              estimate. No Anthropic SDK import, no API calls.
 *   --sample=N Scores N slots' candidates and prints results, WRITES
 *              NOTHING. Requires CONTENT_INTELLIGENCE_DRY_RUN=false AND
 *              ANTHROPIC_API_KEY (paid API calls are privileged).
 *   --apply    Writes confidence_score/claude_notes on pending rows.
 *              Same requirements + claims the content_job_runs
 *              single-flight lock (job_name 'score_photo_candidates').
 *
 * Other flags: --limit=N (slots per run; apply defaults to 25),
 *              --only=<city-slug>, --type=<city|neighborhood|homepage>,
 *              --rescore (include already-scored candidates).
 *
 * Model: CONTENT_CLAUDE_MODEL env (default claude-opus-4-8), configurable
 * per run. ⚠ Before the FIRST sample/apply gate: verify the model id and
 * request shape against official docs (per approval conditions), and add
 * ANTHROPIC_API_KEY to .env.local only — never Vercel.
 *
 * One request per slot: all of a slot's pending candidates are scored
 * together (comparative context mirrors how a human reviews a slot).
 * Structured output via output_config.format json_schema (canonical form
 * per the Claude API docs) — the response text is validated JSON.
 *
 * Cost shape: ~140 slots with candidates today → ~140 requests full run,
 * a few hundred tokens each; --limit bounds each run. The Message
 * Batches API (50% discount) is the future bulk option once scoring
 * volume grows; v1 stays synchronous for inspectability.
 *
 * Never call process.exit() once any client exists (CI-2 lesson).
 */
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const DIFF = argv.includes("--diff");
const RESCORE = argv.includes("--rescore");
const sampleArg = argv.find((a) => a === "--sample" || a.startsWith("--sample="));
const SAMPLE = sampleArg ? Number(sampleArg.split("=")[1]) || 3 : 0;
const limit = Number((argv.find((a) => a.startsWith("--limit=")) ?? "").split("=")[1]) || (APPLY ? 25 : 0);
const only = (argv.find((a) => a.startsWith("--only=")) ?? "").split("=")[1] || "";
const typeFilter = (argv.find((a) => a.startsWith("--type=")) ?? "").split("=")[1] || "";

if (typeFilter && !["city", "neighborhood", "homepage"].includes(typeFilter)) {
  console.error(`REFUSED: --type must be one of city|neighborhood|homepage (got "${typeFilter}").`);
  process.exit(1);
}

if ((APPLY || SAMPLE > 0) && process.env.CONTENT_INTELLIGENCE_DRY_RUN !== "false") {
  console.error(
    "REFUSED: --apply and --sample make PAID Anthropic API calls" +
      (APPLY ? " and database writes" : "") +
      ".\nBoth require CONTENT_INTELLIGENCE_DRY_RUN=false (exactly). Unset or any other value refuses."
  );
  process.exit(1);
}
if ((APPLY || SAMPLE > 0) && !process.env.ANTHROPIC_API_KEY) {
  console.error(
    "REFUSED: ANTHROPIC_API_KEY is not set (.env.local only — never Vercel).\n" +
      "Scoring makes paid API calls; the key is a deliberate, per-machine grant."
  );
  process.exit(1);
}

const MODEL = process.env.CONTENT_CLAUDE_MODEL || "claude-opus-4-8";
const MAX_TOKENS = 4000;
const SLOTS_PER_RUN_DEFAULT = 25;

const RUBRIC = `Score each photo candidate 0-100 for use as the EDITORIAL photo of the
given Discover DFW slot (a city gallery, neighborhood hero, or homepage
pick in the Dallas-Fort Worth metro, Texas).

90-100 clearly depicts the named place/subject, editorially strong
70-89  depicts the place, ordinary but usable
40-69  place-adjacent or generic; a reviewer might keep it
10-39  weak relevance, wrong mood (damage/disaster), or unclear subject
0-9    wrong place entirely, satellite/orbital/aerial-map imagery,
       documents, product-name or same-name-elsewhere collisions

Judge ONLY from the metadata provided (title, description, categories,
photographer, license, dimensions). Known failure modes to score 0-9:
ISS/"View of Earth" frames; photos of same-named places in other
cities/states (e.g. Lakewood Heights, Georgia for Dallas' Lakewood);
matches on software/product names (e.g. "Aurora HDR"). Flags: use
"wrong_place", "orbital", "document", "disaster_mood", "name_collision",
"low_information" when applicable.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "candidate id, echoed exactly" },
          score: { type: "integer", minimum: 0, maximum: 100 },
          reasons: { type: "string", description: "one or two sentences" },
          flags: { type: "array", items: { type: "string" } },
        },
        required: ["id", "score", "reasons", "flags"],
        additionalProperties: false,
      },
    },
  },
  required: ["scores"],
  additionalProperties: false,
};

function printConfig() {
  console.log(`model: ${MODEL} (CONTENT_CLAUDE_MODEL env) · max_tokens ${MAX_TOKENS} · one request per slot (comparative)`);
  console.log(`writes: confidence_score + claude_notes on status='pending' rows ONLY — never status, never photo_assets, never publishes`);
  console.log(`gates: --sample/--apply need CONTENT_INTELLIGENCE_DRY_RUN=false AND ANTHROPIC_API_KEY (paid calls are privileged)`);
  console.log(`rubric:\n${RUBRIC.split("\n").map((l) => "  " + l).join("\n")}`);
}

if (!DIFF && !APPLY && SAMPLE === 0) {
  console.log("DRY RUN (offline) — no database, no network, no Anthropic SDK loaded.");
  printConfig();
  console.log("Next tiers: --diff (read-only DB) · --sample=N (paid API, writes nothing) · --apply (writes scores)");
  process.exit(0);
}

/* ---- DB tiers from here -------------------------------------------------- */
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
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

let q = () =>
  db
    .from("photo_candidates")
    .select(
      "id, photo_slot_id, source, external_id, image_url, source_page_url, photographer, attribution_text, license, width, height, confidence_score, raw_api_response, photo_slots(entity_type, entity_slug, slot_key, label, search_query, required_place_name)"
    )
    .eq("status", "pending")
    .order("id");
const rows = (await fetchAllPaged(q)).filter(
  (r) =>
    (RESCORE || r.confidence_score == null) &&
    (!typeFilter || r.photo_slots.entity_type === typeFilter) &&
    (!only || r.photo_slots.entity_slug === only || r.photo_slots.entity_slug.startsWith(only + "/"))
);

// group by slot — one request scores a slot's candidates together
const bySlot = new Map();
for (const r of rows) {
  if (!bySlot.has(r.photo_slot_id)) bySlot.set(r.photo_slot_id, []);
  bySlot.get(r.photo_slot_id).push(r);
}
let slotGroups = [...bySlot.values()];
const slotCap = SAMPLE > 0 ? SAMPLE : limit > 0 ? limit : APPLY ? SLOTS_PER_RUN_DEFAULT : 0;
if (slotCap > 0) slotGroups = slotGroups.slice(0, slotCap);

if (DIFF && !APPLY) {
  console.log("--diff (read-only) — no API calls, nothing written, no job-run row claimed.");
  printConfig();
  const byType = {};
  for (const [, g] of bySlot) byType[g[0].photo_slots.entity_type] = (byType[g[0].photo_slots.entity_type] ?? 0) + g.length;
  console.log(`unscored pending candidates: ${rows.length} across ${bySlot.size} slot(s) ${JSON.stringify(byType)}`);
  console.log(`full run ≈ ${bySlot.size} request(s); an --apply processes ${SLOTS_PER_RUN_DEFAULT} slot(s) unless --limit overrides`);
  process.exitCode = 0;
} else {
  await runScoring();
}

async function runScoring() {
  // SDK import deferred to the paid tiers only
  let Anthropic;
  try {
    ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
  } catch {
    console.error("REFUSED: @anthropic-ai/sdk is not installed. Run: npm install -D @anthropic-ai/sdk");
    process.exitCode = 1;
    return;
  }
  const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  let run = null;
  if (APPLY) {
    const { data, error } = await db
      .from("content_job_runs")
      .insert({ job_name: "score_photo_candidates", dry_run: false })
      .select("id")
      .single();
    if (error) {
      console.error(
        error.code === "23505"
          ? "REFUSED: another score_photo_candidates run is in flight (or a crashed run holds the lock).\n" +
              "Release: update content_job_runs set finished_at = now(), status = 'failed' " +
              "where job_name = 'score_photo_candidates' and finished_at is null;"
          : `REFUSED: could not claim job run: ${error.message}`
      );
      process.exitCode = 1;
      return;
    }
    run = data;
  }

  let scored = 0, failed = 0, seen = 0;
  const usage = { in: 0, out: 0, requests: 0 };
  const logError = (item_ref, stage, message) =>
    run
      ? db.from("content_job_errors").insert({ run_id: run.id, item_ref, stage, message }).then(() => {})
      : Promise.resolve();

  try {
    for (const group of slotGroups) {
      const slot = group[0].photo_slots;
      const slotRef = `${slot.entity_type}/${slot.entity_slug}/${slot.slot_key}`;
      seen += group.length;
      const payload = {
        slot: {
          entity_type: slot.entity_type,
          entity_slug: slot.entity_slug,
          label: slot.label,
          search_query: slot.search_query,
          required_place_name: slot.required_place_name,
        },
        // evidenceFor() nests provider data under `result` — read there
        // (raw_api_response->'result'), NOT at the top level, or every
        // title/description reaches the model as null
        candidates: group.map((r) => {
          const ev = r.raw_api_response?.result ?? {};
          return {
            id: r.id,
            source: r.source,
            strategy: ev.strategy ?? null,
            title: ev.title ?? null,
            description:
              String(ev.extmetadata?.ImageDescription ?? ev.description ?? "").slice(0, 500) || null,
            categories: ev.categories ?? ev.category ?? null,
            photographer: r.photographer,
            license: r.license,
            width: r.width,
            height: r.height,
            image_filename: decodeURIComponent((r.image_url ?? "").split("/").pop() ?? ""),
          };
        }),
      };
      try {
        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: RUBRIC,
          messages: [{ role: "user", content: JSON.stringify(payload) }],
          output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
        });
        if (response.stop_reason === "refusal") throw new Error("model refusal (stop_reason=refusal)");
        usage.in += response.usage?.input_tokens ?? 0;
        usage.out += response.usage?.output_tokens ?? 0;
        usage.requests++;
        const text = response.content.find((b) => b.type === "text")?.text ?? "";
        const { scores } = JSON.parse(text);
        for (const s of scores) {
          const target = group.find((r) => r.id === s.id);
          if (!target) continue;
          const notes = `${s.reasons}${s.flags.length ? ` [${s.flags.join(", ")}]` : ""}`;
          if (SAMPLE > 0) {
            const c = payload.candidates.find((x) => x.id === s.id);
            console.log(`  [${slotRef}] [${c?.strategy ?? "legacy"}] ${c?.image_filename?.slice(0, 55)} → ${s.score} · ${notes.slice(0, 130)}`);
          } else {
            const { error } = await db
              .from("photo_candidates")
              .update({ confidence_score: s.score, claude_notes: notes })
              .eq("id", s.id)
              .eq("status", "pending");
            if (error) { failed++; await logError(slotRef, "score_write", error.message); }
            else scored++;
          }
        }
      } catch (e) {
        failed++;
        console.warn(`  ${slotRef}: scoring failed — ${e.message}`);
        await logError(slotRef, "score_request", e.message);
      }
    }
  } finally {
    if (run)
      await db
        .from("content_job_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: failed > 0 ? "partial" : "success",
          items_seen: seen,
          items_written: scored,
          error_summary: failed > 0 ? `${failed} failure(s) — see content_job_errors` : null,
        })
        .eq("id", run.id);
  }

  // Opus 4.8: $5/M input · $25/M output
  const cost = (usage.in * 5 + usage.out * 25) / 1e6;
  console.log(`\nusage: ${usage.requests} request(s) · ${usage.in} input + ${usage.out} output tokens ≈ $${cost.toFixed(4)} (model ${MODEL}, effort default)`);
  if (SAMPLE > 0) console.log(`SAMPLE complete: ${slotGroups.length} slot(s) scored via API, nothing written.`);
  else console.log(`APPLY complete: slots=${slotGroups.length} candidates_scored=${scored} failed=${failed} (run ${run?.id})`);
  process.exitCode = failed > 0 ? 1 : 0;
}
