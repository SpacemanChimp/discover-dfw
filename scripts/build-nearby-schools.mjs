/* Build lib/content/nearby-schools.json — the hood pages' "nearby schools"
   dataset. Run manually when refreshing ratings:

     node scripts/build-nearby-schools.mjs

   Source: TEA's public campus directory + A-F accountability ratings, the
   same flat file txschools.gov itself loads (free, no key). For every city
   in lib/dfw.data.json we keep the NEAREST rated traditional campus per
   level (elementary / middle / high), measured from the city centroid
   (`ll`) — hoods don't carry their own coordinates, so hood pages inherit
   the city's picks and the UI labels distances "from <city> center".

   LAUNCH-SAFE RULE: this is proximity context ONLY. Nothing here implies
   assignment/zoning — the UI must say "nearby" + verify-with-the-district. */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "lib/content/nearby-schools.json");
const SOURCE_URL = "https://txschools.gov/data/schools.json";

const data = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/dfw.data.json"), "utf8"));

/* ---- fetch TEA campus file (gzip payload) ---- */
const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`txschools fetch failed: ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
// the file is served as gzip bytes; depending on the client's transparent
// content-decoding we may already hold plain JSON — check the magic number
const isGzip = buf[0] === 0x1f && buf[1] === 0x8b;
const tea = JSON.parse((isGzip ? zlib.gunzipSync(buf) : buf).toString("utf8"));

/* ---- eligible campuses: DFW education regions, traditional, rated, mappable ---- */
const LEVEL_BY_TYPE = {
  Elementary: "Elementary",
  "Middle / Jr. High": "Middle",
  "High School": "High",
};
const PK_ONLY = new Set(["EE", "PK", "KG"]); // early-childhood centers aren't a usable "nearest elementary"

const campuses = tea.filter(
  (s) =>
    (s.region_id === "10" || s.region_id === "11") &&
    s.entity === "Campus" &&
    s.entity_type === "Traditional" &&
    s.online_school !== "Yes" &&
    // neighborhood-serving campuses only. 01/02 = zoned; 05 = combined
    // enrollment (comprehensive schools hosting magnet programs — W.T. White,
    // Pearce, Carter-Riverside all code 05). Excluded: charters (03),
    // selective magnets (04/07), special assignment (06). The 200-student
    // floor drops tiny alternative academies (e.g. 61-student "Quest").
    ["01", "02", "05"].includes(s.enrollment_type_cd) &&
    (s.enrollment ?? 0) >= 200 &&
    /^[A-F]$/.test(s.rating) &&
    LEVEL_BY_TYPE[s.campus_type] &&
    !(s.campus_type === "Elementary" && PK_ONLY.has(s.high_grade_cd)) &&
    typeof s.latitude === "number" &&
    typeof s.longitude === "number"
);

/* ---- district preference: same normalization the rating backfill used ---- */
const normDistrict = (d) =>
  d.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\bmountain\b/g, "mt").replace(/\s+/g, " ").trim();

const allDistricts = [...new Set(campuses.map((s) => normDistrict(s.district_name)))];

function districtsFor(isd) {
  return isd
    .replace(/ISDs$/, "ISD")
    .split(/&|,| and /)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (/(ISD|Academy)$/i.test(x) ? x : x + " ISD"))
    .map(normDistrict)
    .map((p) => allDistricts.find((k) => k === p) ?? allDistricts.find((k) => k.includes(p) || p.includes(k)) ?? p);
}

const R_MI = 3958.8;
function haversineMiles([lon1, lat1], [lon2, lat2]) {
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.sqrt(a));
}

/* Prefer the city's own district(s) inside this radius before falling back
   to the absolute nearest — keeps a same-ISD campus 4 mi out ahead of a
   neighboring district's campus 3.5 mi out, without ever crossing town. */
const SAME_DISTRICT_PREFERENCE_MI = 15;

const cities = {};
for (const c of data.cities) {
  const own = new Set(districtsFor(c.isd));
  const withDist = campuses
    .map((s) => ({ s, miles: haversineMiles(c.ll, [s.longitude, s.latitude]) }))
    .sort((a, b) => a.miles - b.miles);

  const picks = [];
  for (const level of ["Elementary", "Middle", "High"]) {
    const ofLevel = withDist.filter((x) => LEVEL_BY_TYPE[x.s.campus_type] === level);
    const sameIsd = ofLevel.find(
      (x) => own.has(normDistrict(x.s.district_name)) && x.miles <= SAME_DISTRICT_PREFERENCE_MI
    );
    const pick = sameIsd ?? ofLevel[0];
    if (!pick) continue;
    picks.push({
      name: pick.s.name,
      district: pick.s.district_name,
      level,
      rating: pick.s.rating,
      miles: Math.round(pick.miles * 10) / 10,
      city: pick.s.city,
      sameDistrict: own.has(normDistrict(pick.s.district_name)),
    });
  }
  cities[c.slug] = picks;
}

const out = {
  source: "TEA A–F accountability ratings & campus directory — txschools.gov",
  sourceUrl: SOURCE_URL,
  ratingYear: 2025,
  retrieved: new Date().toISOString().slice(0, 10),
  method:
    "Nearest rated traditional campus per level from the city centroid; campuses in the city's own district win within 15 mi. Proximity context only — never an assignment claim.",
  cities,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(
  `wrote ${OUT}: ${Object.keys(cities).length} cities, ` +
    `${Object.values(cities).flat().length} campus picks, from ${campuses.length} eligible campuses`
);
