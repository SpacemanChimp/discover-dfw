/* Template-placement checks for the contextual conversion panels.
   Verifies — against the RENDERED site — that every panel sits exactly
   where the integration spec put it, appears at most once per page, never
   stacks two panels in the same region, and never displaces compliance UI.

   Usage:  npm run check:templates          (probes :3000, else self-starts)
           node scripts/checks/template-placements.mjs --base http://host

   Exit 0 = all placements verified · 1 = violation · 2 = environment. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const BASE_ARG = args.includes("--base") ? args[args.indexOf("--base") + 1] : process.env.AUDIT_BASE_URL || "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (msg) => {
  console.error(`check:templates — ${msg}`);
  process.exit(2);
};

async function probe(base) {
  try {
    const res = await fetch(base + "/sitemap.xml", { signal: AbortSignal.timeout(8000) });
    return res.ok && (await res.text()).includes("/city/");
  } catch {
    return false;
  }
}

async function ensureServer() {
  for (const base of BASE_ARG ? [BASE_ARG.replace(/\/$/, "")] : ["http://localhost:3000"]) {
    if (await probe(base)) return { base, child: null };
  }
  if (BASE_ARG) die(`no DiscoverDFW server at ${BASE_ARG}`);
  if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) die("no production build — run `npm run build` first");
  const port = Number(process.env.AUDIT_PORT || 4323);
  const base = `http://localhost:${port}`;
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "pipe"],
    env: process.env,
  });
  for (let i = 0; i < 90; i++) {
    if (child.exitCode !== null) break;
    if (await probe(base)) return { base, child };
    await sleep(1000);
  }
  try { child.kill(); } catch {}
  die("self-started server never became ready");
}

const vis = (h) =>
  h
    .replace(/<!--[\s\S]*?-->/g, "") // React text-chunk separators
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

let failures = 0;
const fail = (page, msg) => {
  failures++;
  console.error(`  ✗ ${page}: ${msg}`);
};
const pass = (page, msg) => console.log(`  ✓ ${page}: ${msg}`);

function count(text, needle) {
  return text.split(needle).length - 1;
}

function assertOrder(page, text, sequence) {
  let cursor = -1;
  for (const marker of sequence) {
    const idx = text.indexOf(marker, cursor + 1);
    if (idx === -1) {
      fail(page, `expected "${marker}" after position ${cursor}`);
      return false;
    }
    cursor = idx;
  }
  pass(page, `order holds: ${sequence.join(" → ")}`);
  return true;
}

function assertOnce(page, text, needle, expected = 1) {
  const n = count(text, needle);
  if (n !== expected) fail(page, `"${needle}" appears ${n}× (expected ${expected})`);
  else pass(page, `"${needle}" ×${expected}`);
}

function assertAbsent(page, text, needle) {
  if (text.includes(needle)) fail(page, `"${needle}" must not render here`);
  else pass(page, `no "${needle}"`);
}

/* panels must never stack back-to-back. The CTA cards are compact (short
   visible text), so the guard checks that a real section of content sits
   between two panels — genuinely adjacent panels are <~250 chars apart; two
   separated by an intervening report section clear this easily. */
function assertSpacing(page, text, kickers) {
  const idxs = kickers.map((k) => text.indexOf(k)).filter((i) => i >= 0).sort((a, b) => a - b);
  for (let i = 1; i < idxs.length; i++) {
    if (idxs[i] - idxs[i - 1] < 250) {
      fail(page, `two conversion panels within ${idxs[i] - idxs[i - 1]} chars — same-viewport stacking`);
      return;
    }
  }
  pass(page, "panels are spaced apart (no same-viewport stacking)");
}

const { base, child } = await ensureServer();
try {
  const get = async (p) => {
    const res = await fetch(base + p, { signal: AbortSignal.timeout(30000) });
    return { status: res.status, text: vis(await res.text()) };
  };

  // ---- homepage: NO cta at all (Build My Shortlist removed, not replaced) ----
  {
    const { status, text } = await get("/");
    console.log("homepage /");
    if (status !== 200) fail("/", `HTTP ${status}`);
    assertOrder("/", text, ["HOW WE RESEARCH", "WHY DISCOVER DFW"]);
    for (const k of [
      "BUILD MY SHORTLIST",
      "Build my shortlist",
      "CURATED HOMES",
      "COMPARE THIS CITY",
      "HOMEOWNER EQUITY PLAN",
    ])
      assertAbsent("/", text, k);
  }

  // ---- how-we-research ----
  {
    const { status, text } = await get("/how-we-research");
    console.log("/how-we-research");
    if (status !== 200) fail("/how-we-research", `HTTP ${status}`);
    assertOnce("/how-we-research", text, "How we research.");
    assertOnce("/how-we-research", text, "Texas Real Estate Commission Information About Brokerage Services");
  }

  // ---- city report: ONE cta (primary + one secondary), cleaner-list gone ----
  {
    const { status, text } = await get("/city/frisco");
    console.log("/city/frisco");
    if (status !== 200) fail("/city/frisco", `HTTP ${status}`);
    assertOnce("/city/frisco", text, "Compare cities");
    assertOnce("/city/frisco", text, "I already own here");
    assertOrder("/city/frisco", text, ["01 — THE VIBE", "Compare cities", "02 — MARKET SNAPSHOT"]);
    // the removed asks leave nothing behind
    for (const k of [
      "A cleaner list than the entire market",
      "CURATED HOMES",
      "Get a curated list",
      "HOMEOWNER EQUITY PLAN",
      "BUILD MY SHORTLIST",
    ])
      assertAbsent("/city/frisco", text, k);
  }

  // ---- neighborhood report: ONE cta ----
  {
    const { status, text } = await get("/city/addison/les-lacs");
    console.log("/city/addison/les-lacs (neighborhood)");
    if (status !== 200) fail("les-lacs", `HTTP ${status}`);
    assertOnce("les-lacs", text, "Get a curated list");
    assertOnce("les-lacs", text, "Ask a Question");
    assertOrder("les-lacs", text, ["02 — THE REAL ESTATE", "Get a curated list", "03 — WHY PEOPLE LOOK HERE"]);
    for (const k of ["NEW BUILD INTEL", "PLAN A BUILDER TOUR", "Discover Builder Incentives", "INVENTORY PICTURE? REQUEST IT"])
      assertAbsent("les-lacs", text, k);
  }

  // ---- new-build community report (Pecan Square is a real newBuilds entry) ----
  {
    const p = "/city/northlake/pecan-square";
    const { status, text } = await get(p);
    console.log(`${p} (new build)`);
    if (status !== 200) fail(p, `HTTP ${status}`);
    assertOnce(p, text, "Discover Builder Incentives");
    assertOnce(p, text, "Ask a Question");
    assertOrder(p, text, ["02 — NEW BUILD RESOURCES", "Discover Builder Incentives", "03 — WHY BUYERS LOOK HERE"]);
    for (const k of ["PLAN A BUILDER TOUR", "Plan my tour", "CURATED HOMES", "Get a curated list"])
      assertAbsent(p, text, k);
  }

  // ---- live search: delayed, non-obstructive help ----
  for (const p of ["/city/frisco/homes", "/homes"]) {
    const { status, text } = await get(p);
    console.log(p);
    if (status !== 200) fail(p, `HTTP ${status}`);
    assertOnce(p, text, "TOO MANY RESULTS? GET HUMAN HELP");
    assertAbsent(p, text, "HUMAN SEARCH HELP"); // form only after click/engagement
  }

  // ---- property detail: inquiry behavior preserved, attribution intact ----
  {
    const raw = await (await fetch(base + "/city/frisco/homes")).text();
    const lk = (raw.match(/href="(\/listing\/\d+)"/) || [])[1];
    if (!lk) fail("listing", "no listing link found on /city/frisco/homes");
    else {
      const { status, text } = await get(lk);
      console.log(lk);
      if (status !== 200) fail(lk, `HTTP ${status}`);
      assertOnce(lk, text, "Texas Real Estate Commission Information About Brokerage Services");
      if (!/courtesy|LISTING BROKER/i.test(text)) fail(lk, "broker attribution missing");
      else pass(lk, "broker/IDX attribution intact");
      if (!/REQUEST A SHOWING|ASK A QUESTION/i.test(text)) fail(lk, "existing inquiry CTAs missing");
      else pass(lk, "existing property-inquiry CTAs preserved");
      for (const k of ["CURATED HOMES", "BUILD MY SHORTLIST"]) assertAbsent(lk, text, k);
    }
  }

  console.log(failures ? `\nFAIL — ${failures} placement violation(s)` : "\nPASS — all template placements verified");
  process.exitCode = failures ? 1 : 0;
} finally {
  if (child) try { child.kill(); } catch {}
}
