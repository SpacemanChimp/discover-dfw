/* Refresh the editorial market figures in lib/dfw.data.json from the
   NTREIS replica's city_market_snapshots (the same numbers the site already
   publishes on /city/{slug}/homes). Aligns the homepage Ticker/CityIndex and
   every static fallback with live medians so the two public surfaces agree.

   - price ← median_list_price (rounded to $1K, matching fmtK display)
   - ppsf  ← price_per_sqft   (rounded to integer)
   - dom   ← median_days_on_market
   - yoy is NOT touched — it stays an editorial estimate until a year of
     snapshot history exists (see lib/mls/types.ts).

   Writes are byte-preserving splices per city block — the file is never
   re-serialized, so formatting, key order, and untouched cities stay
   byte-identical (the community-draft exporter depends on this file's shape).

   Usage:
     node --env-file=.env.local scripts/content/refresh-city-market-figures.mjs           # dry run
     node --env-file=.env.local scripts/content/refresh-city-market-figures.mjs --apply   # write
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_PATH = path.join(ROOT, "lib", "dfw.data.json");
const APPLY = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("refresh-city-market-figures: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required (run with --env-file=.env.local).");
  process.exit(2);
}

/* latest snapshot per city (rows are unique on city_slug+as_of).
   Plain REST fetch — supabase-js keeps sockets alive at process exit,
   which trips a libuv assertion on Windows. */
const qs =
  "select=city_slug,as_of,active_listings,median_list_price,price_per_sqft,median_days_on_market" +
  "&order=as_of.desc&limit=20000";
const res = await fetch(`${url}/rest/v1/city_market_snapshots?${qs}`, {
  headers: { apikey: key, authorization: `Bearer ${key}` },
});
if (!res.ok) {
  console.error("snapshot query failed:", res.status, await res.text());
  process.exit(2);
}
const rows = await res.json();
const latest = new Map();
for (const r of rows) if (!latest.has(r.city_slug)) latest.set(r.city_slug, r);

let text = fs.readFileSync(DATA_PATH, "utf8");
const cities = JSON.parse(text).cities;

function splice(slug, field, next) {
  const re = new RegExp(`("slug": "${slug}"[\\s\\S]*?"${field}": )(\\d+)`);
  const m = text.match(re);
  if (!m) throw new Error(`no unique ${field} match for ${slug}`);
  const prev = Number(m[2]);
  if (prev === next) return false;
  text = text.replace(re, `$1${next}`);
  return true;
}

let changed = 0;
let skipped = 0;
const lines = [];
for (const c of cities) {
  const s = latest.get(c.slug);
  if (!s || !(Number(s.median_list_price) > 0)) {
    skipped++;
    continue;
  }
  const price = Math.round(Number(s.median_list_price) / 1000) * 1000;
  const ppsf = Number(s.price_per_sqft) > 0 ? Math.round(Number(s.price_per_sqft)) : c.ppsf;
  const dom = Number.isFinite(Number(s.median_days_on_market)) && Number(s.median_days_on_market) >= 0
    ? Math.round(Number(s.median_days_on_market))
    : c.dom;

  const touched = [
    splice(c.slug, "price", price),
    splice(c.slug, "ppsf", ppsf),
    splice(c.slug, "dom", dom),
  ].some(Boolean);
  if (touched) {
    changed++;
    lines.push(
      `${c.slug.padEnd(22)} $${String(c.price / 1000).padStart(4)}K → $${String(price / 1000).padStart(4)}K · ppsf ${c.ppsf}→${ppsf} · dom ${c.dom}→${dom} · ${s.active_listings} active · as of ${s.as_of}`
    );
  }
}

console.log(lines.join("\n") || "(no differences)");
console.log(`\n${changed} cities differ, ${skipped} have no usable snapshot, ${cities.length - changed - skipped} already current.`);

if (!APPLY) {
  console.log("dry run — pass --apply to write lib/dfw.data.json");
  process.exit(0);
}

JSON.parse(text); // must still parse before we overwrite
fs.writeFileSync(DATA_PATH, text);
console.log("wrote lib/dfw.data.json");
