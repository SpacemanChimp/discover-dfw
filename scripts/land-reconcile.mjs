#!/usr/bin/env node
/* Land reconciliation — SERVER-ONLY diagnostic, never bundled.

   Answers the /land build's data questions against the REAL feed + replica:
     1. Trestle/NTREIS   — on-market Land count (8-county scope), by subtype
     2. Replicated store — on-market Land count, distinct county + subtype
     3. Key-level diff    — which land keys are provider-only vs replica-only

   Prints counts + a small sample of diff keys only — never tokens, creds, or
   raw PII. Reads .env.local for local runs.  node scripts/land-reconcile.mjs */
import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i < 1 || line.trim().startsWith("#")) continue;
    const k = line.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = line.slice(i + 1).trim();
  }
}

const ON_MARKET = ["Active", "ActiveUnderContract", "ComingSoon", "Pending"];
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY;
const id = process.env.TRESTLE_API_ID || process.env.TRESTLE_CLIENT_ID;
const secret = process.env.TRESTLE_API_PASSWORD || process.env.TRESTLE_CLIENT_SECRET;
const TOKEN_URL = process.env.TRESTLE_TOKEN_URL || "https://api-trestle.corelogic.com/trestle/oidc/connect/token";
const BASE = process.env.TRESTLE_ODATA_BASE_URL || "https://api-trestle.corelogic.com/trestle/odata";

if (!SUPA_URL || !SUPA_KEY) {
  console.error("Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY).");
  process.exit(2);
}

const sHeaders = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };

/* ---- PostgREST helpers ---- */
async function pgCount(qs) {
  const res = await fetch(`${SUPA_URL}/rest/v1/listings?${qs}`, {
    headers: { ...sHeaders, Prefer: "count=exact", Range: "0-0" },
  });
  if (!res.ok) throw new Error(`pg count ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const cr = res.headers.get("content-range") || "";
  return Number(cr.split("/")[1] || 0);
}
async function pgPage(qs, from, to) {
  const res = await fetch(`${SUPA_URL}/rest/v1/listings?${qs}`, {
    headers: { ...sHeaders, Range: `${from}-${to}` },
  });
  if (!res.ok) throw new Error(`pg page ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}
const inList = (arr) => `(${arr.map((s) => `"${s}"`).join(",")})`;

/* ---- 1. Replica: land totals, distinct county + subtype ---- */
const statusIn = `standard_status=in.${inList(ON_MARKET)}`;
const landBase = `property_type=eq.Land&${statusIn}`;

const replicaTotal = await pgCount(`${landBase}&select=listing_key`);
console.log(`\n[REPLICA] on-market Land total: ${replicaTotal.toLocaleString("en-US")}`);

// pull every land key + subtype + county (paged, no silent cap)
const replicaRows = [];
for (let from = 0; ; from += 1000) {
  const batch = await pgPage(`${landBase}&select=listing_key,property_sub_type,county&order=listing_key.asc`, from, from + 999);
  replicaRows.push(...batch);
  if (batch.length < 1000) break;
}
console.log(`[REPLICA] rows paged: ${replicaRows.length.toLocaleString("en-US")}`);

const bySub = new Map();
const byCounty = new Map();
let noSub = 0, noCounty = 0, noAcre = 0;
for (const r of replicaRows) {
  const s = r.property_sub_type || "(null)";
  bySub.set(s, (bySub.get(s) || 0) + 1);
  if (!r.property_sub_type) noSub++;
  const c = r.county || "(null)";
  byCounty.set(c, (byCounty.get(c) || 0) + 1);
  if (!r.county) noCounty++;
}
// lot_size coverage (separate count — cheaper than dragging it through paging)
noAcre = await pgCount(`${landBase}&or=(lot_size.is.null,lot_size.eq.0)&select=listing_key`);

console.log(`[REPLICA] by PropertySubType:`);
for (const [k, v] of [...bySub.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(18)} ${v}`);
console.log(`[REPLICA] by county:`);
for (const [k, v] of [...byCounty.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(18)} ${v}`);
console.log(`[REPLICA] missing subtype: ${noSub} · missing county: ${noCounty} · missing/zero lot_size: ${noAcre} (${((1 - noAcre / replicaTotal) * 100).toFixed(1)}% have acreage)`);

const replicaKeys = new Set(replicaRows.map((r) => String(r.listing_key)));
// the 8 DFW-metro counties are the TRUE scope; anything else in the replica
// leaked in via a City-name collision (Bossier LA, Lafayette AR, Hunt, …)
const DFW8 = ["Denton", "Tarrant", "Wise", "Collin", "Dallas", "Rockwall", "Kaufman", "Ellis"];
const counties = DFW8;
const inScope = replicaRows.filter((r) => DFW8.includes(r.county));
const fringe = replicaRows.filter((r) => !DFW8.includes(r.county));
const inScopeKeys = new Set(inScope.map((r) => String(r.listing_key)));
console.log(`\n[REPLICA] 8-county (in-scope) land: ${inScope.length} · fringe/out-of-scope (city-name collisions): ${fringe.length}`);
console.log(`[REPLICA] fringe counties: ${[...new Set(fringe.map((r) => r.county))].join(", ")}`);

/* ---- 2. Trestle: on-market Land, 8-county scope ---- */
if (!id || !secret) {
  console.log("\n[TRESTLE] credentials absent — skipping provider side (replica summary above).");
  process.exit(0);
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const tokenRes = await fetch(TOKEN_URL, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret, scope: "api" }),
});
if (!tokenRes.ok) { console.error(`token failed HTTP ${tokenRes.status}`); process.exit(1); }
const { access_token } = await tokenRes.json();
const tHeaders = { Authorization: `Bearer ${access_token}`, Accept: "application/json" };

const statusClause = `StandardStatus in (${ON_MARKET.map(q).join(",")})`;
const countyClause = `CountyOrParish in (${counties.map(q).join(",")})`;
const landFilter = `PropertyType eq 'Land' and ${statusClause} and ${countyClause}`;

async function tCount(filter) {
  const url = `${BASE}/Property?$filter=${encodeURIComponent(filter)}&$top=0&$count=true`;
  const res = await fetch(url, { headers: tHeaders });
  if (!res.ok) throw new Error(`trestle count ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return (await res.json())["@odata.count"];
}

const trestleTotal = await tCount(landFilter);
console.log(`\n[TRESTLE] on-market Land (8-county): ${trestleTotal.toLocaleString("en-US")}`);
for (const sub of ["UnimprovedLand", "ImprovedLand", "Ranch", "Retail", "Warehouse"]) {
  const n = await tCount(`${landFilter} and PropertySubType eq ${q(sub)}`);
  console.log(`   ${sub.padEnd(18)} ${n}`);
}
const noneSub = await tCount(`${landFilter} and PropertySubType eq null`);
console.log(`   ${"(null)".padEnd(18)} ${noneSub}`);

/* ---- 3. Key-level diff ---- */
const trestleKeys = new Set();
let skip = 0;
for (;;) {
  const url =
    `${BASE}/Property?$filter=${encodeURIComponent(landFilter)}` +
    `&$select=ListingKey&$top=5000&$skip=${skip}&$orderby=ListingKey`;
  const res = await fetch(url, { headers: tHeaders });
  if (!res.ok) throw new Error(`trestle keys ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const j = await res.json();
  for (const p of j.value) trestleKeys.add(String(p.ListingKey));
  if (j.value.length < 5000) break;
  skip += 5000;
}
console.log(`[TRESTLE] land keys fetched: ${trestleKeys.size.toLocaleString("en-US")}`);

// compare against IN-SCOPE replica keys only (fringe rows aren't in the
// 8-county Trestle set by definition)
const providerOnly = [...trestleKeys].filter((k) => !inScopeKeys.has(k));
const replicaOnly = [...inScopeKeys].filter((k) => !trestleKeys.has(k));
console.log(`\n[DIFF] provider-only (in Trestle 8-county, not in replica in-scope): ${providerOnly.length}`);
console.log(`       sample: ${providerOnly.slice(0, 8).join(", ") || "—"}`);
console.log(`[DIFF] replica-only (in replica 8-county, not in Trestle on-market now): ${replicaOnly.length}`);
console.log(`       sample: ${replicaOnly.slice(0, 8).join(", ") || "—"}`);
console.log(`\n[SUMMARY] trestle-8county=${trestleTotal} replica-8county=${inScope.length} shared=${trestleKeys.size - providerOnly.length}`);
