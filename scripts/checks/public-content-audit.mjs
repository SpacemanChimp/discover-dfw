/* Publication audit — unfinished/internal content, in source and in the
   rendered public site.

   What it does:
     1. Scans runtime source (app/, components/, lib/, data/, middleware.ts)
        for internal-production phrases (TODO, PLACEHOLDER, CONNECT MLS, …).
     2. Crawls the locally served production build: seeds from /sitemap.xml
        plus BFS over internal links (listing pages sampled, capped).
        Only VISIBLE text is inspected — <script>/<style>/<noscript>/
        comments and all tag attributes are stripped first, so RSC payloads,
        JSON-LD, and legitimate <input placeholder=…> attributes never count.
     3. Structural checks: missing images, skipped section numbers, empty
        sections, broken links, undefined/NaN leaks, provenance labels for
        schools/commute figures, unverified new-build figures, generated
        fallback copy, homepage-vs-live market divergence, subjective
        steering language (product guardrail 4).
     4. Writes docs/publication-audit.md + data/publication-audit.json.

   Exit codes:
     0 — no critical findings
     1 — CRITICAL: an internal-production phrase is visibly rendered on an
         INDEXABLE page (the launch-gate condition)
     2 — environment/usage error (no server and no production build, …)

   Usage:
     npm run audit:public-content            # probes :3000, else self-starts
     node scripts/checks/public-content-audit.mjs --base http://localhost:3000
     AUDIT_PORT=4319 AUDIT_MAX_LISTINGS=24 also respected. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_JSON = path.join(ROOT, "data", "publication-audit.json");
const OUT_MD = path.join(ROOT, "docs", "publication-audit.md");

/* ---------------- configuration ---------------- */

const args = process.argv.slice(2);
const argVal = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const BASE_ARG = argVal("--base") || process.env.AUDIT_BASE_URL || "";
const MAX_LISTINGS = Number(argVal("--max-listings") || process.env.AUDIT_MAX_LISTINGS || 24);
const MAX_PAGES = Number(process.env.AUDIT_MAX_PAGES || 800);
const CONCURRENCY = 6;

/* Internal-production phrases. Visible on an INDEXABLE page → CRITICAL
   (fails the run). Visible on a noindex page → HIGH. In source → LOW. */
const FAIL_PHRASES = [
  ["VERIFY BEFORE PUBLISHING", /\bverify before publishing\b/i],
  ["PLACEHOLDER", /\bplace ?holders?\b/i],
  ["DROP PHOTO", /\bdrop photo\b/i],
  ["ADD LIVE DRIVE-TIME DATA", /\badd live drive.?time data\b/i],
  ["CONNECT MLS", /\bconnect mls\b/i],
  ["REPLACE ME", /\breplace me\b/i],
  ["TODO", /\btodo\b/i],
  ["TBD", /\btbd\b/i], // address-shaped MLS "TBD <street>" hits are reclassified in checkPage()
  ["LOREM IPSUM", /\blorem ipsum\b/i],
  ["DUMMY DATA", /\bdummy data\b/i],
  ["SAMPLE DATA", /\bsample data\b/i],
  ["SAMPLE INVENTORY", /\bsample inventory\b/i],
  ["INTERNAL NOTE", /\binternal note\b/i],
  ["EDITOR NOTE", /\beditor'?s? note\b/i],
  ["DRAFT COPY", /\bdraft copy\b/i],
  ["FIXME", /\bfixme\b/i],
  ["SWAP FOR MLS/LIVE DATA", /\bswap for (the )?(live|mls)\b/i],
  ["PENDING MLS APPROVAL", /\bpending mls approval\b/i],
  ["FICTIONAL (mock-inventory banner)", /\bfictional\b/i],
  ["REPLACE WITH LIVE MLS", /\breplace with live mls\b/i],
];

/* Internal-ish wording worth tracking but not a hard gate. */
const WARN_PHRASES = [
  ["UNVERIFIED", /\bunverified\b/i],
  ["PENDING BROKER/LEGAL REVIEW", /\bpending (broker|legal|ntreis)\b/i],
];

/* Guardrail 4 — subjective/steering language. HIGH wherever it renders. */
const SUBJECTIVE_PHRASES = [
  ["best for families", /\bbest for famil(?:y|ies)\b/i],
  ["safe/safest neighborhood", /\bsafe(?:st)? neighborhood\b/i],
  ["good schools", /\bgood schools?\b/i],
  ["great schools", /\bgreat schools?\b/i],
  ["best schools", /\bbest schools?\b/i],
  ["top-rated (schools)", /\btop.rated\b/i],
  ["family-friendly", /\bfamily.friendly\b/i],
];

/* Deliberate consumer-facing provenance labels — recorded (LOW) so the
   report shows where estimate labels render; not defects by themselves. */
const PROVENANCE_LABELS = [
  ["EDITORIAL ESTIMATE", /\beditorial est(?:imates?|\.)/i],
  ["EDITORIAL FIGURES — VERIFY WITH SALES OFFICES", /\beditorial figures — verify with sales offices\b/i],
  ["ILLUSTRATIVE CURVE", /\billustrative curve\b/i],
];

const SOURCE_DIRS = ["app", "components", "lib", "data"];
const SOURCE_FILES_EXTRA = ["middleware.ts"];
const SOURCE_EXT = new Set([".ts", ".tsx", ".json", ".css", ".mjs"]);

/* ---------------- small utils ---------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (msg) => {
  console.error(`audit:public-content — ${msg}`);
  process.exit(2);
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/* Visible text only: comments, scripts (incl. RSC flight data + JSON-LD),
   styles, noscript, templates removed; then every tag (and therefore every
   attribute, incl. input placeholder=) stripped. */
function visibleText(html) {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<template\b[\s\S]*?<\/template>/gi, " ")
    .replace(/<(?:p|div|section|article|li|tr|br|footer|header|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(cleaned)
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function excerptAround(text, regex, radius = 90) {
  const m = text.match(regex);
  if (!m) return "";
  const i = m.index ?? 0;
  return text
    .slice(Math.max(0, i - radius), i + m[0].length + radius)
    .replace(/\s+/g, " ")
    .trim();
}

function metaRobots(html) {
  const m =
    html.match(/<meta\s+name="robots"\s+content="([^"]*)"/i) ||
    html.match(/<meta\s+content="([^"]*)"\s+name="robots"/i);
  return m ? m[1].toLowerCase() : null;
}

function pageTitle(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? decodeEntities(m[1]).trim() : "";
}

function imgSources(html) {
  const out = [];
  for (const m of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) {
    if (!m[1].startsWith("data:")) out.push(m[1]);
  }
  return out;
}

function internalLinks(html, siteHosts) {
  const out = new Set();
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)) {
    let href = decodeEntities(m[1]);
    if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    if (/^https?:\/\//i.test(href)) {
      try {
        const u = new URL(href);
        if (!siteHosts.has(u.host)) continue;
        href = u.pathname + u.search;
      } catch {
        continue;
      }
    }
    if (!href.startsWith("/")) continue; // in-page anchors etc.
    href = href.split("#")[0];
    if (!href) continue;
    if (/^\/(admin|account|api|auth|trec)\b/.test(href)) continue;
    out.add(href);
  }
  return [...out];
}

/* ---------------- dataset ---------------- */

function slugifyHood(name) {
  // must mirror lib/slug.ts exactly
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const dfw = JSON.parse(fs.readFileSync(path.join(ROOT, "lib", "dfw.data.json"), "utf8"));
const hoodContent = JSON.parse(fs.readFileSync(path.join(ROOT, "lib", "hood-content.json"), "utf8"));
const cityBySlug = new Map(dfw.cities.map((c) => [c.slug, c]));
const newBuildSlugs = new Set(dfw.newBuilds.map((nb) => slugifyHood(nb.name)));
const newBuildBySlug = new Map(dfw.newBuilds.map((nb) => [slugifyHood(nb.name), nb]));

/* ---------------- source scan ---------------- */

function* walkSource(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    if (e.name.startsWith("publication-audit")) continue; // never scan our own output
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkSource(p);
    else if (SOURCE_EXT.has(path.extname(e.name))) yield p;
  }
}

function scanSource() {
  const findings = [];
  const files = [];
  for (const d of SOURCE_DIRS) {
    const abs = path.join(ROOT, d);
    if (fs.existsSync(abs)) files.push(...walkSource(abs));
  }
  for (const f of SOURCE_FILES_EXTRA) {
    const abs = path.join(ROOT, f);
    if (fs.existsSync(abs)) files.push(abs);
  }
  const all = [...FAIL_PHRASES, ...WARN_PHRASES, ...SUBJECTIVE_PHRASES];
  for (const file of files) {
    const rel = path.relative(ROOT, file).replaceAll("\\", "/");
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const [label, re] of all) {
        if (re.test(line)) {
          findings.push({
            file: rel,
            line: i + 1,
            phrase: label,
            snippet: line.trim().slice(0, 200),
          });
        }
      }
    });
  }
  return findings;
}

/* ---------------- server ---------------- */

async function probe(base) {
  try {
    const res = await fetch(base + "/sitemap.xml", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
    const body = await res.text();
    return body.includes("/city/"); // sanity: it is THIS site
  } catch {
    return false;
  }
}

async function ensureServer() {
  const candidates = BASE_ARG ? [BASE_ARG.replace(/\/$/, "")] : ["http://localhost:3000"];
  for (const base of candidates) {
    if (await probe(base)) return { base, child: null };
  }
  if (BASE_ARG) die(`no Discover DFW server answering at ${BASE_ARG}`);
  const buildId = path.join(ROOT, ".next", "BUILD_ID");
  if (!fs.existsSync(buildId)) {
    die("no server on :3000 and no production build found — run `npm run build` first");
  }
  const port = Number(process.env.AUDIT_PORT || 4319);
  const base = `http://localhost:${port}`;
  console.log(`starting production server on :${port} …`);
  const child = spawn(
    process.execPath,
    [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: process.env }
  );
  child.stderr.on("data", (d) => process.stderr.write(String(d)));
  for (let i = 0; i < 90; i++) {
    if (child.exitCode !== null) break;
    if (await probe(base)) return { base, child };
    await sleep(1000);
  }
  try { child.kill(); } catch {}
  die("self-started server never became ready");
}

/* ---------------- crawl ---------------- */

async function fetchPage(base, p) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(base + p, {
        signal: AbortSignal.timeout(30000),
        headers: { "user-agent": "discoverdfw-publication-audit" },
        redirect: "follow",
      });
      return { status: res.status, html: res.ok ? await res.text() : "" };
    } catch (e) {
      if (attempt === 1) return { status: 0, html: "", error: String(e) };
      await sleep(1500);
    }
  }
}

function classify(p, text) {
  if (p === "/") return "homepage";
  if (p === "/homes" || p.startsWith("/homes?")) return "homes-search";
  if (p === "/land" || p.startsWith("/land?")) return "land-search";
  if (p === "/new-builds" || p.startsWith("/new-builds?") || p.startsWith("/new-builds#")) return "new-builds-search";
  let m = p.match(/^\/city\/([^/?]+)\/homes/);
  if (m) return "city-homes-search";
  m = p.match(/^\/city\/([^/?]+)\/([^/?]+)$/);
  if (m) {
    if (/NEW BUILD COMMUNITY REPORT/i.test(text) || newBuildSlugs.has(m[2])) return "new-build-report";
    return "neighborhood-report";
  }
  if (p.match(/^\/city\/([^/?]+)$/)) return "city-report";
  if (p.startsWith("/listing/")) return "listing";
  return "other";
}

function cityCommunityOf(p) {
  const m = p.match(/^\/city\/([^/?]+)(?:\/([^/?]+))?/);
  if (!m) return { city: "", community: "" };
  const c = cityBySlug.get(m[1]);
  const city = c ? c.name : m[1];
  let community = "";
  if (m[2] && m[2] !== "homes") {
    const nb = newBuildBySlug.get(m[2]);
    community = nb ? nb.name : m[2].replace(/-/g, " ");
  }
  return { city, community };
}

/* ---------------- issue factory ---------------- */

const issues = [];
let issueSeq = 0;
function addIssue(i) {
  issues.push({ id: `PA-${String(++issueSeq).padStart(3, "0")}`, ...i });
}

/* Source-file hints per page type, for rendered findings. */
const SOURCE_HINTS = {
  homepage: "app/page.tsx + components/{Hero,Ticker,InteractiveMap,EditorsPicks,StatsBand,NewBuilds,CityIndex,About,Newsletter,Footer}.tsx + lib/dfw.data.json",
  "city-report": "app/city/[slug]/page.tsx + lib/dfw.data.json",
  "neighborhood-report": "app/city/[slug]/[hood]/page.tsx + lib/hood-content.json + lib/dfw.data.json",
  "new-build-report": "app/city/[slug]/[hood]/page.tsx + lib/dfw.data.json (newBuilds) + lib/hood-content.json",
  "homes-search": "app/homes/page.tsx + components/search/MapRoom.tsx",
  "land-search": "app/land/page.tsx + components/search/LandRoom.tsx",
  "new-builds-search": "app/new-builds/page.tsx + components/search/NewBuildsRoom.tsx",
  "city-homes-search": "app/city/[slug]/homes/page.tsx + components/city-homes/*",
  listing: "app/listing/[listingKey]/page.tsx + components/listing/* + lib/compliance.ts",
  other: "",
};

/* Files most likely to feed each page type — used to rank source matches. */
const RANK_FILES = {
  "neighborhood-report": ["lib/hoods.ts", "lib/hood-content.json", "app/city/[slug]/[hood]/page.tsx"],
  "new-build-report": ["lib/hoods.ts", "lib/hood-content.json", "app/city/[slug]/[hood]/page.tsx", "lib/dfw.data.json"],
  "city-report": ["app/city/[slug]/page.tsx", "lib/dfw.data.json"],
  "homes-search": ["components/search/MapRoom.tsx", "app/homes/page.tsx"],
  "land-search": ["components/search/LandRoom.tsx", "app/land/page.tsx"],
  "new-builds-search": ["components/search/NewBuildsRoom.tsx", "components/newbuild", "app/new-builds/page.tsx"],
  "city-homes-search": ["app/city/[slug]/homes/page.tsx", "components/city-homes/CityMarketMiniSnapshot.tsx"],
  homepage: ["components/StatsBand.tsx", "components/InteractiveMap.tsx", "components/Footer.tsx", "app/page.tsx"],
  listing: ["components/listing", "lib/compliance.ts"],
};

function sourceFor(pageType, phraseLabel, sourceFindings) {
  const candidates = sourceFindings.filter((s) => s.phrase === phraseLabel);
  const ranked = RANK_FILES[pageType] || [];
  let hit;
  for (const r of ranked) {
    hit = candidates.find((s) => s.file.startsWith(r));
    if (hit) break;
  }
  hit = hit || candidates[0];
  const exact = hit ? `${hit.file}:${hit.line}` : "";
  const hint = SOURCE_HINTS[pageType] || "";
  return exact ? (hint ? `${exact} (template: ${hint.split(" + ")[0]})` : exact) : hint;
}

/* MLS listings for land/new construction often carry a literal "TBD <street>"
   address. That is feed data, not unfinished site copy — reclassified. */
const STREET_SUFFIX =
  "street|st|drive|dr|road|rd|lane|ln|court|ct|trail|trl|circle|cir|avenue|ave|blvd|boulevard|way|pkwy|parkway|hwy|highway|fm|cr|ranch|surv\\w*|acres?";
const STREET_AFTER_RE = new RegExp(`^\\s+(?:[A-Za-z0-9'.-]+\\s+){0,4}(?:${STREET_SUFFIX})\\b`, "i");
const STREET_BEFORE_RE = new RegExp(`\\b(?:${STREET_SUFFIX})\\s*$`, "i");
function tbdIsMlsAddress(text) {
  const matches = [...text.matchAll(/\btbd\b/gi)];
  if (!matches.length) return { any: false, allAddresses: false };
  const allAddresses = matches.every((m) => {
    const before = text.slice(Math.max(0, m.index - 120), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 60);
    return (
      /\$[\d,]+[^$]{0,20}$/.test(before) || // "$350,000 TBD …" (price precedes address)
      STREET_AFTER_RE.test(after) || // "TBD Lot 4 West End Street"
      /^\s+(?:CR|FM|HWY)-?\d/i.test(after) || // "TBD Cr-301 …"
      STREET_BEFORE_RE.test(before) || // "… FM 2728 Road TBD" (subdivision field = TBD)
      /MLS PHOTO|MLS#/i.test(before) // inside a listing card — feed data by construction
    );
  });
  return { any: true, allAddresses };
}

/* ---------------- per-page checks ---------------- */

function checkPage(page, sourceFindings) {
  const { path: p, text, html, status, indexable, pageType } = page;
  const { city, community } = cityCommunityOf(p);
  const base = { url: p, pageType, city, community };

  if (status !== 200) {
    addIssue({
      ...base,
      category: "broken-page",
      severity: "high",
      phrase: `HTTP ${status}`,
      excerpt: page.error || "",
      sourceFile: SOURCE_HINTS[pageType] || "",
      visiblyRendered: true,
      indexable: false,
      recommendation: "Page fails to render — fix or remove every link pointing at it.",
      canRemainPublic: false,
    });
    return;
  }

  // MLS "TBD <street>" addresses on search/listing surfaces are feed data,
  // not unfinished copy — record once as a low-severity data artifact.
  const searchLike = ["homes-search", "land-search", "new-builds-search", "city-homes-search", "listing"].includes(pageType);
  const tbd = searchLike ? tbdIsMlsAddress(text) : { any: false, allAddresses: false };
  if (tbd.any && tbd.allAddresses) {
    addIssue({
      ...base,
      category: "mls-data-artifact",
      severity: "low",
      phrase: 'MLS-provided "TBD <street>" address on listing card(s)',
      excerpt: excerptAround(text, /\btbd\b/i),
      sourceFile: "NTREIS feed data (UnparsedAddress) — not site copy",
      visiblyRendered: true,
      indexable,
      recommendation: "Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.",
      canRemainPublic: true,
    });
  }

  // 1) internal-production phrases (the launch gate)
  for (const [label, re] of FAIL_PHRASES) {
    if (label === "TBD" && tbd.any && tbd.allAddresses) continue; // reclassified above
    if (re.test(text)) {
      addIssue({
        ...base,
        category: "internal-phrase",
        severity: indexable ? "critical" : "high",
        phrase: label,
        excerpt: excerptAround(text, re),
        sourceFile: sourceFor(pageType, label, sourceFindings),
        visiblyRendered: true,
        indexable,
        recommendation: indexable
          ? "Internal-production wording is visible on an indexable page. Remove it or gate it behind isLiveMls before this page stays public."
          : "Visible only in a noindex mode/page today — still remove or gate before that surface is ever indexed.",
        canRemainPublic: !indexable,
      });
    }
  }

  // 2) internal-ish wording (watch list)
  for (const [label, re] of WARN_PHRASES) {
    if (re.test(text)) {
      addIssue({
        ...base,
        category: "internal-phrase-watch",
        severity: "high",
        phrase: label,
        excerpt: excerptAround(text, re),
        sourceFile: sourceFor(pageType, label, sourceFindings),
        visiblyRendered: true,
        indexable,
        recommendation: "Internal-status wording rendered publicly — replace with consumer-appropriate copy.",
        canRemainPublic: true,
      });
    }
  }

  // 3) subjective / steering language (guardrail 4)
  for (const [label, re] of SUBJECTIVE_PHRASES) {
    if (re.test(text)) {
      addIssue({
        ...base,
        category: "subjective-language",
        severity: "high",
        phrase: label,
        excerpt: excerptAround(text, re),
        sourceFile: sourceFor(pageType, label, sourceFindings),
        visiblyRendered: true,
        indexable,
        recommendation: "Steering/subjective claim (product guardrail 4) — rewrite as an objective, sourced fact.",
        canRemainPublic: true,
      });
    }
  }

  // 4) deliberate provenance labels (informational)
  for (const [label, re] of PROVENANCE_LABELS) {
    if (re.test(text)) {
      addIssue({
        ...base,
        category: "provenance-label",
        severity: "low",
        phrase: label,
        excerpt: excerptAround(text, re),
        sourceFile: sourceFor(pageType, label, sourceFindings),
        visiblyRendered: true,
        indexable,
        recommendation: "Deliberate estimate label — keep, but confirm final wording in the broker/legal compliance review.",
        canRemainPublic: true,
      });
    }
  }

  // 5) broken-render tokens
  for (const [label, re] of [
    ["undefined", /(^|[\s>])undefined([\s<.,]|$)/],
    ["NaN", /\bNaN\b/],
    ["[object Object]", /\[object Object\]/],
  ]) {
    if (re.test(text)) {
      addIssue({
        ...base,
        category: "broken-render",
        severity: "high",
        phrase: `literal "${label}" in visible text`,
        excerpt: excerptAround(text, re),
        sourceFile: SOURCE_HINTS[pageType] || "",
        visiblyRendered: true,
        indexable,
        recommendation: "A raw JS value is leaking into rendered copy — fix the template.",
        canRemainPublic: false,
      });
    }
  }

  // 6) images — editorial/report pages with no real photography
  if (["homepage", "city-report", "neighborhood-report", "new-build-report"].includes(pageType)) {
    if (imgSources(html).length === 0) {
      addIssue({
        ...base,
        category: "missing-images",
        severity: "medium",
        phrase: "no real images render on this page",
        excerpt: "",
        sourceFile: "photo pipeline: lib/content/editorial-photos.ts + admin Photo Desk",
        visiblyRendered: true,
        indexable,
        recommendation: "Approve photos for this page's slots via the Photo Desk (photo_candidates → approve). Page may stay public — layout is designed to hold without photos.",
        canRemainPublic: true,
      });
    }
  }

  // 7) numbered-section continuity (structurally incomplete pages)
  if (["city-report", "neighborhood-report", "new-build-report"].includes(pageType)) {
    // zero-padded 01–09 only: report sections are numbered 01…07; plain
    // two-digit numbers before "—" (commute minutes etc.) are not sections
    const nums = [...text.matchAll(/(?:^|\n| )(0\d) — [A-Z]/g)].map((m) => Number(m[1]));
    const uniq = [...new Set(nums)].sort((a, b) => a - b);
    for (let i = 1; i < uniq.length; i++) {
      if (uniq[i] - uniq[i - 1] > 1) {
        addIssue({
          ...base,
          category: "structural-gap",
          severity: "medium",
          phrase: `numbered sections jump ${String(uniq[i - 1]).padStart(2, "0")} → ${String(uniq[i]).padStart(2, "0")}`,
          excerpt: `visible section numbers: ${uniq.map((n) => String(n).padStart(2, "0")).join(", ")}`,
          sourceFile: SOURCE_HINTS[pageType] || "",
          visiblyRendered: true,
          indexable,
          recommendation: "A numbered section is hidden (usually the photo gallery awaiting approved photos) — approve content for it or renumber so the page reads complete.",
          canRemainPublic: true,
        });
      }
    }
    // empty numbered sections
    const parts = text.split(/(?=(?:^|\n)\d{2} — [A-Z])/);
    for (const part of parts) {
      const head = part.match(/^(?:\n)?(\d{2} — [^\n]{0,60})/);
      if (head && part.replace(/\s+/g, " ").trim().length < 80) {
        addIssue({
          ...base,
          category: "empty-section",
          severity: "medium",
          phrase: `section "${head[1].trim()}" renders nearly empty`,
          excerpt: part.replace(/\s+/g, " ").trim().slice(0, 160),
          sourceFile: SOURCE_HINTS[pageType] || "",
          visiblyRendered: true,
          indexable,
          recommendation: "Section heading renders with no body — fill or hide the section.",
          canRemainPublic: false,
        });
      }
    }
  }

  // 8) provenance for schools / commute figures on city reports
  if (pageType === "city-report") {
    if (/04 — SCHOOLS/i.test(text) && !/\bTEA\b/i.test(text)) {
      addIssue({
        ...base,
        category: "school-provenance",
        severity: "medium",
        phrase: "school section without TEA provenance label",
        excerpt: excerptAround(text, /04 — SCHOOLS/i),
        sourceFile: "app/city/[slug]/page.tsx + lib/dfw.data.json (schools)",
        visiblyRendered: true,
        indexable,
        recommendation: "School ratings must carry their TEA source label.",
        canRemainPublic: true,
      });
    }
    if (/05 — GETTING AROUND/i.test(text) && !/OFF-PEAK/i.test(text)) {
      addIssue({
        ...base,
        category: "commute-provenance",
        severity: "medium",
        phrase: "commute figures without OFF-PEAK/OSRM provenance label",
        excerpt: excerptAround(text, /05 — GETTING AROUND/i),
        sourceFile: "app/city/[slug]/page.tsx + lib/dfw.data.json (commute)",
        visiblyRendered: true,
        indexable,
        recommendation: "Commute estimates must carry their off-peak/OpenStreetMap provenance label.",
        canRemainPublic: true,
      });
    }
  }

  // 9) new-build figures without a verification date
  if (pageType === "new-build-report") {
    const m = p.match(/^\/city\/[^/]+\/([^/?]+)$/);
    const nb = m ? newBuildBySlug.get(m[1]) : undefined;
    if (nb && !("verifiedAt" in nb) && /PRICED FROM|BUILDERS|STATUS/i.test(text)) {
      addIssue({
        ...base,
        category: "unverified-newbuild-figures",
        severity: "medium",
        phrase: `from ${nb.from} · ${nb.builders} builders · ${nb.status} — no verification date in dataset`,
        excerpt: "",
        sourceFile: "lib/dfw.data.json (newBuilds entry)",
        visiblyRendered: true,
        indexable,
        recommendation: "Pricing/builder-count/status figures have no verification date. Add a verified-as-of field to the newBuilds entry (and render it), or publish through the human-verified Supabase pipeline.",
        canRemainPublic: true,
      });
    }
  }

  // 10) generated fallback copy (page exists, but no reviewed editorial entry)
  if (["neighborhood-report", "new-build-report"].includes(pageType)) {
    const m = p.match(/^\/city\/([^/]+)\/([^/?]+)$/);
    if (m && !hoodContent[`${m[1]}/${m[2]}`]) {
      addIssue({
        ...base,
        category: "generated-fallback-copy",
        severity: "low",
        phrase: "page renders formula-generated copy (no reviewed entry in lib/hood-content.json)",
        excerpt: "",
        sourceFile: "lib/hoods.ts contentFor() fallback",
        visiblyRendered: true,
        indexable,
        recommendation: "Replace generated copy with reviewed editorial content via the Content Desk export. Page may remain public — fallback copy is deterministic and claim-safe by design.",
        canRemainPublic: true,
      });
    }
  }

  // 11) drive-time minute claims inside editorial prose (informational)
  if (["neighborhood-report", "new-build-report"].includes(pageType)) {
    if (/about \d{1,2} minutes/i.test(text)) {
      addIssue({
        ...base,
        category: "drive-time-claims",
        severity: "low",
        phrase: "specific drive-time claims in editorial prose",
        excerpt: excerptAround(text, /about \d{1,2} minutes/i),
        sourceFile: "lib/hood-content.json / lib/hoods.ts contentFor()",
        visiblyRendered: true,
        indexable,
        recommendation: "Figures derive from the OSRM pass — re-verify whenever the commute dataset is refreshed.",
        canRemainPublic: true,
      });
    }
  }
}

/* Cross-surface market consistency: every surface consumes the canonical
   metric layer (lib/market), so the RENDERED median for a city must agree
   across the homepage (Ticker + CityIndex), the city report hero, and the
   city home-search band. Small tolerance covers ISR timing skew only. */
const PRICE_TOKEN = /\$(\d+(?:\.\d+)?)([KM])/;
const parsePrice = (num, unit) => Number(num) * (unit === "M" ? 1_000_000 : 1000);

function checkMarketConflicts(pages) {
  const home = pages.find((p) => p.path === "/" && p.status === 200);
  const homePrices = new Map(); // slug → [values rendered on the homepage]
  if (home) {
    for (const m of home.html.matchAll(
      /href="\/city\/([a-z0-9-]+)"(?:(?!<\/a>)[\s\S]){0,800}?\$(\d+(?:\.\d+)?)([KM])/g
    )) {
      const list = homePrices.get(m[1]) ?? [];
      list.push(parsePrice(m[2], m[3]));
      homePrices.set(m[1], list);
    }
  }

  const surfaceValues = new Map(); // slug → {surface: value}
  for (const pg of pages) {
    if (pg.status !== 200) continue;
    let m = pg.path.match(/^\/city\/([^/?]+)\/homes$/);
    if (m) {
      const t = pg.text.match(new RegExp(`MEDIAN LIST\\s*\\n?\\s*${PRICE_TOKEN.source}`, "i"));
      if (t) {
        const v = surfaceValues.get(m[1]) ?? {};
        v["city-homes-search"] = parsePrice(t[1], t[2]);
        surfaceValues.set(m[1], v);
      }
      continue;
    }
    m = pg.path.match(/^\/city\/([^/?]+)$/);
    if (m) {
      // anchor on the market card's full label — bare "MEDIAN LIST" also
      // appears in nearby-city chips and must not be parsed as this city's
      const t = pg.text.match(new RegExp(`MEDIAN ACTIVE LIST PRICE\\s*\\n?\\s*${PRICE_TOKEN.source}`, "i"));
      if (t) {
        const v = surfaceValues.get(m[1]) ?? {};
        v["city-report"] = parsePrice(t[1], t[2]);
        surfaceValues.set(m[1], v);
      }
    }
  }

  for (const [slug, v] of surfaceValues) {
    const c = cityBySlug.get(slug);
    if (!c) continue;
    const values = { ...v };
    const hp = homePrices.get(slug);
    if (hp?.length) {
      values["homepage"] = hp[0];
      // Ticker and CityIndex must agree with each other too
      if (hp.some((x) => Math.abs(x - hp[0]) / hp[0] > 0.001)) {
        addIssue({
          url: "/",
          pageType: "homepage",
          city: c.name,
          community: "",
          category: "cross-surface-market-conflict",
          severity: "high",
          phrase: `homepage renders multiple different medians for ${c.name}: ${hp.map((x) => "$" + Math.round(x / 1000) + "K").join(" vs ")}`,
          excerpt: "",
          sourceFile: "lib/market/metrics.ts consumers (Ticker/CityIndex/InteractiveMap)",
          visiblyRendered: true,
          indexable: true,
          recommendation: "All homepage surfaces must render the same canonical median for a city.",
          canRemainPublic: true,
        });
      }
    }
    const entries = Object.entries(values);
    if (entries.length < 2) continue;
    const [refSurface, refVal] = entries[0];
    for (const [surface, val] of entries.slice(1)) {
      const drift = Math.abs(val - refVal) / refVal;
      if (drift > 0.02) {
        addIssue({
          url: `/city/${slug}`,
          pageType: "city-report",
          city: c.name,
          community: "",
          category: "cross-surface-market-conflict",
          severity: "high",
          phrase: `median differs across surfaces: ${refSurface} $${Math.round(refVal / 1000)}K vs ${surface} $${Math.round(val / 1000)}K (${(drift * 100).toFixed(1)}% apart)`,
          excerpt: "",
          sourceFile: "lib/market/metrics.ts (canonical layer) — a surface is bypassing it",
          visiblyRendered: true,
          indexable: true,
          recommendation: "Every surface must consume the canonical metric layer; no surface may hold its own copy of a market statistic.",
          canRemainPublic: true,
        });
      }
    }
  }
}

/* links from public pages to broken targets */
function checkBrokenLinks(pages, statusByPath) {
  const seen = new Set();
  for (const pg of pages) {
    if (pg.status !== 200) continue;
    for (const l of pg.links || []) {
      const st = statusByPath.get(l);
      if (st !== undefined && st >= 400 && !seen.has(l)) {
        seen.add(l);
        addIssue({
          url: l,
          pageType: classify(l, ""),
          ...cityCommunityOf(l),
          category: "broken-link",
          severity: "high",
          phrase: `link target returns HTTP ${st}`,
          excerpt: `linked from ${pg.path}`,
          sourceFile: "",
          visiblyRendered: true,
          indexable: false,
          recommendation: "Fix or remove the link; a public page links to a broken report.",
          canRemainPublic: false,
        });
      }
    }
  }
}

/* ---------------- report writers ---------------- */

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function writeReports(meta, pages, sourceFindings) {
  issues.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.url.localeCompare(b.url));

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of issues) counts[i.severity]++;

  const json = {
    generatedAt: new Date().toISOString(),
    command: "npm run audit:public-content",
    baseUrl: meta.base,
    mlsProvider: process.env.MLS_PROVIDER || "(unset → mock)",
    liveMode: ["trestle", "local", "database"].includes(process.env.MLS_PROVIDER || ""),
    pagesCrawled: pages.length,
    routeCoverage: meta.coverage,
    summary: counts,
    failCondition: "critical = internal-production phrase visibly rendered on an indexable page",
    issues,
    sourceFindings,
    pages: pages.map((p) => ({
      url: p.path,
      status: p.status,
      pageType: p.pageType,
      indexable: p.indexable,
      title: p.title,
      images: p.imgCount,
      issueCount: issues.filter((i) => i.url === p.path).length,
    })),
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(json, null, 2) + "\n");

  const md = [];
  md.push("# Publication audit — unfinished / internal content");
  md.push("");
  md.push("> GENERATED FILE — do not hand-edit. Regenerate with `npm run audit:public-content`.");
  md.push("> Internal working document; not a public route.");
  md.push("");
  md.push(`- Generated: ${json.generatedAt}`);
  md.push(`- Base URL: ${json.baseUrl} · MLS mode: \`${json.mlsProvider}\` (${json.liveMode ? "live" : "mock"})`);
  md.push(`- Pages crawled: ${pages.length} (${meta.coverage})`);
  md.push(`- Fail condition: ${json.failCondition}`);
  md.push("");
  md.push("| Severity | Count |");
  md.push("|---|---|");
  for (const s of ["critical", "high", "medium", "low"]) md.push(`| ${s} | ${counts[s]} |`);
  md.push("");
  md.push("Notes on route coverage: About and The Letter (newsletter) are homepage sections, audited under `/`. County pages do not exist as routes — counties render as homepage map regions and city-index groupings. Listing pages are sampled (high-churn, never in the sitemap).");
  md.push("");

  for (const sev of ["critical", "high", "medium", "low"]) {
    const group = issues.filter((i) => i.severity === sev);
    md.push(`## ${sev.toUpperCase()} (${group.length})`);
    md.push("");
    if (!group.length) {
      md.push("_None._");
      md.push("");
      continue;
    }
    // aggregate bulk categories so the doc stays readable
    const bulk = ["generated-fallback-copy", "drive-time-claims", "unverified-newbuild-figures", "missing-images", "provenance-label", "structural-gap"];
    const byCat = new Map();
    for (const i of group) {
      if (!byCat.has(i.category)) byCat.set(i.category, []);
      byCat.get(i.category).push(i);
    }
    for (const [cat, list] of byCat) {
      md.push(`### ${cat} (${list.length})`);
      md.push("");
      if (bulk.includes(cat) && list.length > 12) {
        md.push(`_${list.length} pages affected — full list in \`data/publication-audit.json\`._`);
        md.push("");
        md.push(`- Recommendation: ${list[0].recommendation}`);
        md.push(`- Source: ${list[0].sourceFile || "—"}`);
        md.push(`- Can remain public during remediation: ${list[0].canRemainPublic ? "yes" : "no"}`);
        md.push(`- Sample pages: ${list.slice(0, 10).map((i) => `\`${i.url}\``).join(", ")}${list.length > 10 ? " …" : ""}`);
        md.push("");
      } else {
        md.push("| URL | Page type | City / community | Phrase / finding | Rendered | Indexable | Stay public? |");
        md.push("|---|---|---|---|---|---|---|");
        for (const i of list) {
          const who = [i.city, i.community].filter(Boolean).join(" / ") || "—";
          md.push(
            `| \`${i.url}\` | ${i.pageType} | ${who} | ${i.phrase.replace(/\|/g, "\\|")} | ${i.visiblyRendered ? "yes" : "no"} | ${i.indexable ? "yes" : "no"} | ${i.canRemainPublic ? "yes" : "no"} |`
          );
        }
        md.push("");
        for (const i of list) {
          md.push(`- **${i.id}** \`${i.url}\` — ${i.phrase}`);
          if (i.excerpt) md.push(`  - excerpt: “${i.excerpt.slice(0, 220)}”`);
          if (i.sourceFile) md.push(`  - source: ${i.sourceFile}`);
          md.push(`  - remediation: ${i.recommendation}`);
        }
        md.push("");
      }
    }
  }

  md.push("## Source-scan findings (not rendered — comments, gated strings, data records)");
  md.push("");
  md.push("These phrases exist in runtime source but did not appear in any crawled page's visible text (typically code comments or strings gated behind `isLiveMls` / admin routes). Keep them out of render paths.");
  md.push("");
  md.push("| File | Line | Phrase | Snippet |");
  md.push("|---|---|---|---|");
  for (const s of sourceFindings) {
    md.push(`| \`${s.file}\` | ${s.line} | ${s.phrase} | \`${s.snippet.replace(/\|/g, "\\|").slice(0, 110)}\` |`);
  }
  md.push("");
  fs.writeFileSync(OUT_MD, md.join("\n") + "\n");
}

/* ---------------- main ---------------- */

async function main() {
  console.log("scanning source …");
  const sourceFindings = scanSource();
  console.log(`  ${sourceFindings.length} source phrase hits`);

  const { base, child } = await ensureServer();
  const stop = () => { if (child) try { child.kill(); } catch {} };
  process.on("SIGINT", () => { stop(); process.exit(2); });

  try {
    const siteHosts = new Set(["www.discoverdfw.com", "discoverdfw.com", new URL(base).host]);

    // seeds: sitemap + fixed entry points
    const smRes = await fetch(base + "/sitemap.xml", { signal: AbortSignal.timeout(15000) });
    const smXml = await smRes.text();
    const seeds = new Set(["/", "/homes"]);
    for (const m of smXml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      try { seeds.add(new URL(m[1]).pathname); } catch {}
    }

    const queue = [...seeds];
    const seen = new Set(queue);
    const pages = [];
    const listingLinks = new Set();
    let listingsCrawled = 0;

    async function worker() {
      while (queue.length) {
        if (pages.length >= MAX_PAGES) return;
        const p = queue.shift();
        if (p === undefined) return;
        const { status, html, error } = await fetchPage(base, p);
        const text = html ? visibleText(html) : "";
        const page = {
          path: p,
          status,
          error,
          html,
          text,
          title: pageTitle(html),
          indexable: status === 200 && !(metaRobots(html) || "").includes("noindex"),
          pageType: classify(p, text),
          imgCount: imgSources(html).length,
          links: html ? internalLinks(html, siteHosts) : [],
        };
        pages.push(page);
        if (pages.length % 50 === 0) console.log(`  crawled ${pages.length} pages …`);
        for (const l of page.links) {
          if (l.startsWith("/listing/")) {
            listingLinks.add(l);
            continue; // sampled later
          }
          if (!seen.has(l)) {
            seen.add(l);
            queue.push(l);
          }
        }
      }
    }

    console.log(`crawling from ${base} (${seeds.size} seeds) …`);
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // deterministic listing sample: sorted, evenly spaced, capped
    const allListings = [...listingLinks].sort();
    const step = Math.max(1, Math.floor(allListings.length / Math.max(1, MAX_LISTINGS)));
    const sample = allListings.filter((_, i) => i % step === 0).slice(0, MAX_LISTINGS);
    queue.push(...sample.filter((l) => !seen.has(l)));
    sample.forEach((l) => seen.add(l));
    listingsCrawled = queue.length;
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    console.log(`crawled ${pages.length} pages total (${listingsCrawled} sampled listings of ${allListings.length} discovered)`);

    // checks
    for (const pg of pages) checkPage(pg, sourceFindings);
    checkMarketConflicts(pages);
    const statusByPath = new Map(pages.map((p) => [p.path, p.status]));
    checkBrokenLinks(pages, statusByPath);

    const byType = {};
    for (const p of pages) byType[p.pageType] = (byType[p.pageType] || 0) + 1;
    const coverage = Object.entries(byType).map(([k, v]) => `${k}: ${v}`).join(", ");

    writeReports({ base, coverage }, pages, sourceFindings);

    const criticals = issues.filter((i) => i.severity === "critical");
    const counts = ["critical", "high", "medium", "low"]
      .map((s) => `${s}: ${issues.filter((i) => i.severity === s).length}`)
      .join(" · ");
    console.log(`\naudit complete — ${counts}`);
    console.log(`wrote ${path.relative(ROOT, OUT_MD)} and ${path.relative(ROOT, OUT_JSON)}`);

    if (criticals.length) {
      console.error(`\nFAIL: ${criticals.length} internal-production phrase(s) visible on indexable pages:`);
      for (const c of criticals) console.error(`  ${c.url} — ${c.phrase}`);
      process.exitCode = 1;
    } else {
      console.log("PASS: no internal-production phrases on indexable pages.");
    }
  } finally {
    stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
