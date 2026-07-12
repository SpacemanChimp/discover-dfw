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

/* ==== CB-3a content mode — lib/hood-content.json =============================
   Exports READY community_content_drafts rows into the existing editorial
   content file. Same discipline as the dataset mode: fail-closed batches,
   verify-before-write, splice-then-stamp. The lint rules are MIRRORED from
   lib/content/community-content-drafts.ts (the portal's live panel + ready
   gate) — if you change a rule THERE, change it HERE. */

export const CONTENT_FILE = path.join(ROOT, "lib", "hood-content.json");

export const CONTENT_LIMITS = {
  TITLE_MIN: 25, TITLE_MAX: 60,
  DESC_MIN: 70, DESC_MAX: 160,
  INTRO_MIN_PARAGRAPHS: 2, INTRO_MIN_CHARS: 300,
  FAQ_MIN_ENTRIES: 2, FAQ_ANSWER_MIN: 40,
};

export const RISKY_CLAIM_PATTERNS = [
  { re: /\b(zoned to|zoned for|attendance zone|feeds? into|assigned to)\b/i, why: "school zoning claims need district verification (hard rule)" },
  { re: /\battends?\b.{0,40}\b(elementary|middle|high school|isd)\b/i, why: "school assignment claims need district verification (hard rule)" },
  { re: /\bfinal phase\b/i, why: '"final phase" claims need builder verification (hard rule)' },
  { re: /\b(official|exclusive|complete|full) (builder|builders|builder list|roster)\b/i, why: "builder-roster assertions need verification (hard rule)" },
  { re: /\bguarantee[ds]?\b/i, why: "guarantee language is not review-safe" },
  { re: /\bprices? (are|start|starting|begin)\b.{0,30}\$\d/i, why: "exact pricing claims beyond the from-band are not review-safe" },
];

/** Resolve a content key against the hoodsForCity union (page must exist). */
export function pageForKey(data, citySlug, hoodSlug) {
  const city = data.cities.find((c) => c.slug === citySlug);
  if (!city) return null;
  for (const [name] of city.hoods) {
    if (slugifyHood(name) === hoodSlug)
      return { city, hoodName: name, nb: data.newBuilds.find((x) => x.name.toLowerCase() === name.toLowerCase()) ?? null };
  }
  const nb = data.newBuilds.find((x) => x.city === citySlug && slugifyHood(x.name) === hoodSlug);
  if (nb) return { city, hoodName: nb.name, nb };
  return null;
}

/* metadata formulas — mirrored from app/city/[slug]/[hood]/page.tsx */
export function formulaTitleFor(page) {
  return page.nb
    ? `${page.hoodName} — New Construction Homes in ${page.city.name}, TX`
    : `${page.hoodName} — ${page.city.name}, TX Neighborhood Guide & Homes`;
}
export function formulaDescriptionFor(data, page) {
  const county = (data.counties ?? []).find((co) => co.id === page.city.county);
  const countyName = county?.name ?? page.city.county;
  return page.nb
    ? `${page.hoodName} is a new-build community in ${page.city.name}, TX (${countyName} County) — ${page.nb.status.toLowerCase()}, priced from the ${page.nb.from} with ${page.nb.builders} active builders. Amenities, buyer resources, schools & FAQs.`
    : `${page.hoodName} neighborhood in ${page.city.name}, TX (${countyName} County): what it's like to live there, homes & real estate character, ${page.city.isd} schools, commutes, and FAQs.`;
}

const normSeo = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
export function isNearDuplicate(a, b) {
  const na = normSeo(a), nb = normSeo(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const wa = new Set(na.split(" ")), wb = new Set(nb.split(" "));
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const union = wa.size + wb.size - inter;
  return union > 0 && inter / union >= 0.9;
}

/** The exact HoodContent value a content draft becomes (key order matches
    the existing file's entries; optional blocks only when present). */
export function contentValue(d) {
  const out = {
    tagline: (d.tagline ?? "").trim(),
    intro: (d.intro_json ?? []).map((p) => String(p).trim()).filter(Boolean),
    homes: (d.homes_copy ?? "").trim(),
    highlights: (d.highlights_json ?? []).map((h) => ({ title: h.title, note: h.note })),
    faq: (d.faq_json ?? []).map((f) => ({ q: f.q, a: f.a })),
  };
  if (d.newbuild_json) out.newBuild = { amenities: d.newbuild_json.amenities ?? [], buyerNotes: d.newbuild_json.buyerNotes ?? [] };
  const seo = {};
  if ((d.seo_title ?? "").trim()) seo.title = d.seo_title.trim();
  if ((d.seo_description ?? "").trim()) seo.description = d.seo_description.trim();
  if (Object.keys(seo).length) out.seo = seo;
  return out;
}

function screen(field, text, errors) {
  for (const { re, why } of RISKY_CLAIM_PATTERNS) {
    const m = re.exec(String(text ?? ""));
    if (m) errors.push(`[${field}] "${m[0]}" — ${why}`);
  }
}

/** Export-strictness lint. `seoCorpus` = [{key, title, description, source}]
    covering every page's formula pair, existing hood-content seo entries,
    and the other non-archived content drafts. Returns error strings. */
export function lintContent(d, data, seoCorpus) {
  const errors = [];
  const key = `${d.city_slug}/${d.hood_slug}`;
  const page = pageForKey(data, d.city_slug, d.hood_slug);
  if (!page) return [`[page] ${key} is not an existing page — content attaches only to live pages`];
  const L = CONTENT_LIMITS;
  const v = contentValue(d);

  if (!v.tagline || !v.intro.length || !v.homes || !v.highlights.length || !v.faq.length)
    errors.push("[body] export requires the full core body (tagline, intro, homes, highlights, FAQ) — contentFor() renders a hit as-is");
  const introChars = v.intro.join(" ").length;
  if (v.intro.length && (v.intro.length < L.INTRO_MIN_PARAGRAPHS || introChars < L.INTRO_MIN_CHARS))
    errors.push(`[intro] ${v.intro.length} paragraph(s) / ${introChars} chars — minimum ${L.INTRO_MIN_PARAGRAPHS} paragraphs and ${L.INTRO_MIN_CHARS} chars (thin-content gate)`);
  if (v.faq.length && v.faq.length < L.FAQ_MIN_ENTRIES) errors.push(`[faq] ${v.faq.length} entry — minimum ${L.FAQ_MIN_ENTRIES} (FAQPage structured data)`);
  for (const [i, f] of v.faq.entries()) {
    if (!f.q?.trim()) errors.push(`[faq[${i}]] question is empty`);
    if ((f.a ?? "").trim().length < L.FAQ_ANSWER_MIN) errors.push(`[faq[${i}]] answer is ${(f.a ?? "").trim().length} chars — minimum ${L.FAQ_ANSWER_MIN}`);
  }
  for (const [i, h] of v.highlights.entries())
    if (!h.title?.trim() || !h.note?.trim()) errors.push(`[highlights[${i}]] needs both a title and a note`);
  if (v.newBuild && !page.nb) errors.push(`[newBuild] ${key} is not a new-build page — remove the newBuild block`);

  if (v.seo?.title) {
    const t = v.seo.title;
    if (t.length < L.TITLE_MIN || t.length > L.TITLE_MAX) errors.push(`[seoTitle] ${t.length} chars — must be ${L.TITLE_MIN}–${L.TITLE_MAX}`);
    if (isNearDuplicate(t, formulaTitleFor(page))) errors.push("[seoTitle] identical to this page's generated title — omit the override instead");
    for (const c of seoCorpus) if (c.key !== key && c.title && isNearDuplicate(t, c.title)) errors.push(`[seoTitle] duplicates the ${c.source} title of ${c.key}`);
  }
  if (v.seo?.description) {
    const dd = v.seo.description;
    if (dd.length < L.DESC_MIN || dd.length > L.DESC_MAX) errors.push(`[seoDescription] ${dd.length} chars — must be ${L.DESC_MIN}–${L.DESC_MAX}`);
    if (isNearDuplicate(dd, formulaDescriptionFor(data, page))) errors.push("[seoDescription] identical to this page's generated description — omit the override instead");
    for (const c of seoCorpus) if (c.key !== key && c.description && isNearDuplicate(dd, c.description)) errors.push(`[seoDescription] duplicates the ${c.source} description of ${c.key}`);
  }

  screen("seoTitle", v.seo?.title, errors);
  screen("seoDescription", v.seo?.description, errors);
  screen("tagline", v.tagline, errors);
  screen("intro", v.intro.join(" "), errors);
  screen("homes", v.homes, errors);
  for (const [i, h] of v.highlights.entries()) screen(`highlights[${i}]`, `${h.title} ${h.note}`, errors);
  for (const [i, f] of v.faq.entries()) screen(`faq[${i}]`, `${f.q} ${f.a}`, errors);
  for (const s of [...(v.newBuild?.amenities ?? []), ...(v.newBuild?.buyerNotes ?? [])]) screen("newBuild", s, errors);

  return errors;
}

/** Build the corpus for duplicate detection. `contentObj` = parsed
    hood-content.json; `otherDraftRows` = the other non-archived content
    drafts ({city_slug,hood_slug,seo_title,seo_description}). */
export function buildContentSeoCorpus(data, contentObj, otherDraftRows) {
  const corpus = [];
  for (const c of data.cities) {
    const seen = new Set();
    for (const [name] of c.hoods) seen.add(slugifyHood(name));
    for (const nb of data.newBuilds) if (nb.city === c.slug) seen.add(slugifyHood(nb.name));
    for (const hoodSlug of seen) {
      const page = pageForKey(data, c.slug, hoodSlug);
      if (page) corpus.push({ key: `${c.slug}/${hoodSlug}`, title: formulaTitleFor(page), description: formulaDescriptionFor(data, page), source: "formula" });
    }
  }
  for (const [key, val] of Object.entries(contentObj)) {
    if (val?.seo?.title || val?.seo?.description) corpus.push({ key, title: val.seo.title ?? null, description: val.seo.description ?? null, source: "exported" });
  }
  for (const r of otherDraftRows ?? []) {
    corpus.push({ key: `${r.city_slug}/${r.hood_slug}`, title: r.seo_title, description: r.seo_description, source: "draft" });
  }
  return corpus;
}

/** Merge entries into hood-content.json's raw text. The file must be
    roundtrip-stable under JSON.stringify(·, null, 1) + its own EOL
    convention (verified before ANY write); keys stay alphabetically
    sorted; every untouched key must survive byte-identical. */
export function buildContentExport(rawContent, entries) {
  if (rawContent.charCodeAt(0) === 0xfeff) throw new Error("content file has a BOM — refusing");
  const crlf = rawContent.includes("\r\n");
  let normalized = crlf ? rawContent.replace(/\r\n/g, "\n") : rawContent;
  // the file may carry one trailing newline at EOF — preserve it on output
  let trailing = "";
  if (normalized.endsWith("\n")) {
    trailing = "\n";
    normalized = normalized.slice(0, -1);
  }
  const parsed = JSON.parse(rawContent);
  if (JSON.stringify(parsed, null, 1) !== normalized)
    throw new Error("hood-content.json is not roundtrip-stable under JSON.stringify(·, null, 1) — refusing to re-serialize; investigate before exporting");

  const changes = [];
  const merged = { ...parsed };
  for (const { key, value } of entries) {
    changes.push({ key, kind: key in parsed ? "updated" : "added" });
    merged[key] = value;
  }
  const sorted = {};
  for (const k of Object.keys(merged).sort()) sorted[k] = merged[k];
  const outNormalized = JSON.stringify(sorted, null, 1) + trailing;
  const outRaw = crlf ? outNormalized.replace(/\n/g, "\r\n") : outNormalized;

  const reparsed = JSON.parse(outRaw);
  const entryKeys = new Set(entries.map((e) => e.key));
  if (Object.keys(reparsed).length !== Object.keys(parsed).length + changes.filter((c) => c.kind === "added").length)
    throw new Error("post-merge key count mismatch");
  for (const k of Object.keys(parsed)) {
    if (entryKeys.has(k)) continue;
    if (JSON.stringify(reparsed[k]) !== JSON.stringify(parsed[k]))
      throw new Error(`untouched key "${k}" changed — refusing (unselected keys must remain byte-identical)`);
  }
  for (const { key, value } of entries) {
    if (JSON.stringify(reparsed[key]) !== JSON.stringify(value)) throw new Error(`exported key "${key}" does not match its draft`);
  }
  return { outRaw, changes };
}

export function commitBodyContent(drafts) {
  const lines = drafts.map((d) => `- ${d.city_slug}/${d.hood_slug}${(d.seo_title ?? "").trim() ? "  (custom SEO title)" : ""}`);
  return [
    `CB-3a content export: ${drafts.length} page(s) of editorial/SEO content`,
    "",
    ...lines,
    "",
    "Content-only change to lib/hood-content.json from the Content Desk",
    "(admin-written, linted at export strictness — thin/duplicate/risky-",
    "claim gates fail closed; unselected keys verified byte-identical).",
    "Pages without a key keep contentFor()'s generated fallback; no code",
    "or route changes.",
    "",
    "Validation: build clean with ZERO page-count delta; sitemap",
    "unchanged; edited pages spot-rendered (head title/description,",
    "FAQPage JSON-LD, intro paragraphs).",
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
  const CONTENT = argv.includes("--content"); // CB-3a: lib/hood-content.json mode
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
    const contentRaw = readFileSync(CONTENT_FILE, "utf8");
    const contentKeys = Object.keys(JSON.parse(contentRaw)).length;
    console.log("CB-2/CB-3a draft exporter — offline config");
    console.log(`  dataset file: lib/dfw.data.json (${raw.length} chars, ${data.cities.length} cities, ${data.newBuilds.length} newBuilds)`);
    console.log(`  content file: lib/hood-content.json (${contentRaw.length} chars, ${contentKeys} keys)`);
    console.log("  modes: dataset (default) | --content (editorial/SEO content -> hood-content.json)");
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

  /* ==== CB-3a content mode flow ==== */
  async function runContentMode() {
    const contentRawText = readFileSync(CONTENT_FILE, "utf8");
    const contentObj = JSON.parse(contentRawText);
    const wanted = MARK_LIVE || UNEXPORT ? "exported" : "ready";
    let q = db
      .from("community_content_drafts")
      .select("id, city_slug, hood_slug, seo_title, seo_description, tagline, intro_json, homes_copy, highlights_json, faq_json, newbuild_json, lifecycle, ready_for_export")
      .eq("lifecycle", wanted);
    if (wanted === "ready") q = q.eq("ready_for_export", true);
    if (slugArg) {
      const [c, s] = slugArg.split("/");
      q = q.eq("city_slug", c ?? "").eq("hood_slug", s ?? "");
    }
    const { data: rows, error } = await q.order("city_slug").order("hood_slug");
    if (error) throw new Error(`could not read community_content_drafts: ${error.message}`);
    const drafts = rows ?? [];

    const contentAudit = async (d, notes) => {
      const { error: e } = await db.from("verification_events").insert({
        entity_type: "community_content_draft",
        entity_slug: `${d.city_slug}/${d.hood_slug}`,
        verified_by: "cb2-exporter",
        verification_method: "admin_review",
        action: "update",
        notes,
      });
      if (e) console.warn(`  audit row failed for ${d.city_slug}/${d.hood_slug}: ${e.message}`);
    };

    if (MARK_LIVE || UNEXPORT) {
      if (!drafts.length) {
        console.log(`${MARK_LIVE ? "MARK-LIVE" : "UNEXPORT"} (content): no 'exported' content drafts${slugArg ? ` matching ${slugArg}` : ""} — nothing to do.`);
        return;
      }
      const run = await claimRun();
      if (!run) {
        process.exitCode = 1;
        return;
      }
      let done = 0, failedN = 0;
      const patch = MARK_LIVE ? { lifecycle: "live", live_at: new Date().toISOString() } : { lifecycle: "ready", exported_at: null };
      for (const d of drafts) {
        const { error: e } = await db.from("community_content_drafts").update(patch).eq("id", d.id).eq("lifecycle", "exported");
        if (e) {
          failedN++;
          console.error(`  ${d.city_slug}/${d.hood_slug}: ${e.message}`);
        } else {
          done++;
          await contentAudit(d, MARK_LIVE ? `content confirmed live post-merge (run ${run.id})` : `content unexported — PR abandoned (run ${run.id})`);
          console.log(`  ${d.city_slug}/${d.hood_slug}: exported -> ${MARK_LIVE ? "live" : "ready"}`);
        }
      }
      await finishRun(run, failedN ? "partial" : "success", drafts.length, done, failedN ? `${failedN} failure(s)` : null);
      console.log(`\n${MARK_LIVE ? "MARK-LIVE" : "UNEXPORT"} (content) complete: updated=${done} failed=${failedN} (run ${run.id})`);
      process.exitCode = failedN ? 1 : 0;
      return;
    }

    console.log(`--${APPLY ? "apply" : "diff"} --content — ${drafts.length} ready content draft(s)${slugArg ? ` scoped to ${slugArg}` : ""}.${DIFF ? " Nothing written, no job-run row claimed." : ""}\n`);
    if (!drafts.length) {
      console.log("No eligible content drafts.");
      return;
    }

    const { data: othersRows } = await db
      .from("community_content_drafts")
      .select("id, city_slug, hood_slug, seo_title, seo_description")
      .neq("lifecycle", "archived");
    const draftIds = new Set(drafts.map((d) => d.id));
    const others = (othersRows ?? []).filter((r) => !draftIds.has(r.id));
    const baseCorpus = buildContentSeoCorpus(data, contentObj, others);

    let anyErrors = false;
    const plan = [];
    for (const d of drafts) {
      const key = `${d.city_slug}/${d.hood_slug}`;
      const value = contentValue(d);
      const stampOnly = key in contentObj && JSON.stringify(contentObj[key]) === JSON.stringify(value);
      const corpus = [
        ...baseCorpus,
        ...drafts.filter((o) => o !== d).map((o) => ({ key: `${o.city_slug}/${o.hood_slug}`, title: o.seo_title, description: o.seo_description, source: "draft" })),
      ];
      const errors = stampOnly ? [] : lintContent(d, data, corpus);
      if (errors.length) {
        anyErrors = true;
        console.log(`  ${key}: FAIL`);
        for (const e of errors) console.log(`      ${e}`);
      } else {
        console.log(`  ${key}: ${stampOnly ? "STAMP-ONLY (already in content file)" : key in contentObj ? "OK (updates existing key)" : "OK (adds new key)"}`);
      }
      plan.push({ d, key, value, stampOnly });
    }
    if (anyErrors) {
      console.error(`\nBATCH FAILS CLOSED: fix or archive the failing draft(s), then re-run.${APPLY ? " Nothing written; drafts remain 'ready'." : ""}`);
      process.exitCode = 1;
      return;
    }
    const toWrite = plan.filter((p) => !p.stampOnly).map((p) => ({ key: p.key, value: p.value }));

    if (DIFF) {
      if (toWrite.length) {
        const { changes } = buildContentExport(contentRawText, toWrite);
        console.log("\nchanges:");
        for (const c of changes) console.log(`  -> ${c.kind}: ${c.key}`);
      }
      console.log(`\nwould update lifecycle ready -> exported for ${plan.length} draft(s) on --apply`);
      console.log("\n--- commit message preview -------------------------------------------");
      console.log(commitBodyContent(drafts));
      console.log("----------------------------------------------------------------------");
      return;
    }

    // APPLY — same amendment ordering as the dataset mode: write first,
    // stamp lifecycles ONLY after the file write succeeded
    const run = await claimRun();
    if (!run) {
      process.exitCode = 1;
      return;
    }
    let stamped = 0, stampFailed = 0;
    try {
      if (toWrite.length) {
        const { outRaw, changes } = buildContentExport(contentRawText, toWrite);
        writeFileSync(CONTENT_FILE, outRaw, "utf8");
        console.log(`\ncontent file written: ${contentRawText.length} -> ${outRaw.length} chars (${changes.map((c) => `${c.kind} ${c.key}`).join(", ")})`);
      } else {
        console.log("\nno file change needed (all drafts already in the content file) — stamping only");
      }
      for (const { d, key } of plan) {
        const { error: e } = await db
          .from("community_content_drafts")
          .update({ lifecycle: "exported", exported_at: new Date().toISOString() })
          .eq("id", d.id)
          .eq("lifecycle", "ready");
        if (e) {
          stampFailed++;
          console.error(`  stamp failed for ${key}: ${e.message} — re-run --apply --content --slug=${key} (it will classify as stamp-only)`);
        } else {
          stamped++;
          await contentAudit(d, `content exported: run ${run.id}`);
        }
      }
      console.log(`\nAPPLY (content) complete: written=${toWrite.length} stamped=${stamped} stamp_failed=${stampFailed} (run ${run.id})`);
      console.log("\nNEXT (human-gated): review the working-tree diff, commit on a fresh branch, push, open the PR.");
      console.log("--- ready-to-paste commit message ------------------------------------");
      console.log(commitBodyContent(drafts));
      console.log("----------------------------------------------------------------------");
      await finishRun(run, stampFailed ? "partial" : "success", drafts.length, stamped, stampFailed ? `${stampFailed} stamp failure(s)` : null);
      process.exitCode = stampFailed ? 1 : 0;
    } catch (e) {
      console.error(`\nAPPLY (content) ABORTED before any lifecycle change: ${e.message}`);
      console.error("The content file was NOT modified unless 'content file written' printed above; drafts remain 'ready'.");
      await finishRun(run, "failed", drafts.length, stamped, String(e.message).slice(0, 400));
      process.exitCode = 1;
    }
  }

  try {
    if (CONTENT) {
      await runContentMode();
    } else if (DIFF) {
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
