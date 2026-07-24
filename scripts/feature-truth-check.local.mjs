#!/usr/bin/env node
/* READ-ONLY release verification: rendered feature pages vs direct DB truth.
   For each sampled page: compare the rendered on-market total against a
   PostgREST count with IDENTICAL predicates, and verify every ItemList
   listing actually satisfies the page's city+feature conditions.
   Usage: node scripts/feature-truth-check.local.mjs <baseUrl> */
import { readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3111";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const OM = "standard_status=in.(Active,ActiveUnderContract,ComingSoon,Pending)";
const data = JSON.parse(readFileSync("lib/dfw.data.json", "utf8"));
const cityNames = data.cities.map((c) => c.name);
const nameBySlug = Object.fromEntries(data.cities.map((c) => [c.slug, c.name]));
const CITY90 = `city=in.(${cityNames.map((n) => `"${n}"`).join(",")})`;

const PRED = {
  "with-pool": "has_private_pool=is.true",
  "on-acreage": "property_type=eq.Residential&lot_size=gte.1",
  "3-car-garage": "garage_spaces=gte.3",
  "single-story": "levels=eq.One",
  "5-plus-bedrooms": "beds=gte.5",
};

async function truthCount(q) {
  const r = await fetch(`${URL_}/rest/v1/listings?select=listing_key&${q}`, {
    headers: { ...H, Prefer: "count=exact", Range: "0-0" },
  });
  return parseInt((r.headers.get("content-range") || "").split("/")[1] ?? "0", 10) || 0;
}
async function truthRows(q) {
  const r = await fetch(`${URL_}/rest/v1/listings?${q}`, { headers: H });
  return await r.json();
}

async function page(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: "text/html" } });
  const html = await res.text();
  const totals = [...html.matchAll(/([\d,]+)\s*<!-- -->\s*MATCHING LISTINGS|([\d,]+) MATCHING LISTINGS/g)]
    .map((m) => parseInt((m[1] ?? m[2]).replace(/,/g, ""), 10));
  // ItemList JSON-LD (rail-adjacent)
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => m[1]);
  let itemKeys = [];
  for (const s of scripts) {
    try {
      const j = JSON.parse(s);
      const arr = Array.isArray(j) ? j : [j];
      for (const o of arr) {
        if (o["@type"] === "ItemList") itemKeys = o.itemListElement.map((e) => String(e.url).split("/listing/")[1]);
      }
    } catch { /* other jsonld */ }
  }
  const robotsNoindex = /<meta name="robots" content="[^"]*noindex/.test(html);
  const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] ?? null;
  const status = res.status;
  return { status, totals, itemKeys, robotsNoindex, canonical, htmlLen: html.length };
}

const checks = [];
async function check(label, path, truthQ, { expectNoindex = false, cityName = null, pred = null } = {}) {
  const p = await page(path);
  const truth = truthQ != null ? await truthCount(truthQ) : null;
  const renderedTotal = p.totals.length ? Math.max(...p.totals) : null;
  let itemsOk = null;
  if (p.itemKeys.length && pred) {
    const keys = p.itemKeys.map((k) => `"${k}"`).join(",");
    const rows = await truthRows(`select=listing_key,city&${OM}&${pred}&listing_key=in.(${keys})`);
    const okKeys = new Set(rows.filter((r) => !cityName || r.city === cityName).map((r) => r.listing_key));
    itemsOk = p.itemKeys.every((k) => okKeys.has(k));
  }
  const countOk = truth == null || renderedTotal === truth;
  checks.push({ label, path, status: p.status, truth, renderedTotal, countOk, items: p.itemKeys.length, itemsOk, noindex: p.robotsNoindex, expectNoindex, canonical: p.canonical });
}

// two metro pages (default browse scope = the 90 curated cities)
await check("metro with-pool", "/homes/with-pool", `${OM}&${CITY90}&${PRED["with-pool"]}`, { pred: PRED["with-pool"] });
await check("metro single-story", "/homes/single-story", `${OM}&${CITY90}&${PRED["single-story"]}`, { pred: PRED["single-story"] });
// six city pages incl. one with >1,000 records
for (const [f, cs] of [
  ["with-pool", "frisco"],
  ["on-acreage", "argyle"],
  ["3-car-garage", "northlake"],
  ["single-story", "fort-worth"], // 3,234 > 1,000: count exactness beyond the PostgREST cap
  ["5-plus-bedrooms", "prosper"],
  ["with-pool", "mckinney"],
]) {
  const name = nameBySlug[cs];
  await check(`city ${f}/${cs}`, `/homes/${f}/${cs}`, `${OM}&city=eq.${encodeURIComponent(name)}&${PRED[f]}`, { cityName: name, pred: PRED[f] });
}
// a low-inventory UNPUBLISHED combination must render but stay noindex
await check("unpublished with-pool/sanger", "/homes/with-pool/sanger", `${OM}&city=eq.Sanger&${PRED["with-pool"]}`, { expectNoindex: true, cityName: "Sanger", pred: PRED["with-pool"] });
// a zero-result combination renders honestly (Westlake pools: tiny market)
await check("zero-ish on-acreage/sunnyvale?minac=50", "/homes/on-acreage/sunnyvale?minac=50", `${OM}&city=eq.Sunnyvale&property_type=eq.Residential&lot_size=gte.50`, { expectNoindex: true, cityName: "Sunnyvale" });

let fail = 0;
for (const c of checks) {
  const noindexOk = c.expectNoindex ? c.noindex : !c.noindex;
  const ok = c.status === 200 && c.countOk && noindexOk && c.itemsOk !== false;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${c.label} status=${c.status} truth=${c.truth} rendered=${c.renderedTotal} items=${c.items} itemsOk=${c.itemsOk} noindex=${c.noindex}(want ${c.expectNoindex}) canonical=${c.canonical}`);
}
console.log(fail === 0 ? "ALL TRUTH CHECKS PASSED" : `${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
