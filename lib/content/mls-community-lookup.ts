/* Community Builder (CB-1) — MLS lookup, SERVER-ONLY.

   Reads OUR replicated NTREIS listings store only — no external calls, no
   provider APIs, no writes. Given a community name + city it returns
   new-construction counts (Active / Pending / quick-move-in estimate),
   observed SubdivisionName aliases, MLS-observed builder names, a
   suggested price band, and cross-city homonym warnings (the "Pecan
   Square Condos, Addison" trap).

   The normalization/lexicon logic is a deliberate copy of
   scripts/content/seed-new-build-communities.mjs (NB-1) — that script is
   gated and working, so v1 copies the pure functions instead of
   refactoring it into a shared module. If you change a rule HERE, change
   it THERE (and re-run the script's --diff regression check). */
import "server-only";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { cities } from "@/lib/dfw-data";

/* ---- normalization (mirrors NB-1) ---------------------------------------- */

const norm = (s: unknown) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const SUFFIX_TOKENS = new Set(["PH", "PHS", "PHASE", "SEC", "SECT", "SECTION", "BLK", "BLOCK", "ADD", "ADDN", "ADDITION", "UNIT", "INST", "INSTALLMENT", "TR", "TRACT", "LOT", "LOTS", "REP", "REPLAT", "NO"]);

function normalizeSubdivision(s: unknown): string {
  const tokens = norm(s).split(" ").filter(Boolean);
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    if (/\d/.test(last) || SUFFIX_TOKENS.has(last)) tokens.pop();
    else break;
  }
  return tokens.join(" ");
}

const BUILDER_LEXICON = [
  "Highland Homes", "Perry Homes", "David Weekley Homes", "Coventry Homes", "Chesmar Homes",
  "American Legend Homes", "Britton Homes", "Drees Custom Homes", "Gehan Homes", "Brightland Homes",
  "Trophy Signature Homes", "HistoryMaker Homes", "Bloomfield Homes", "First Texas Homes", "Grand Homes",
  "Shaddock Homes", "Toll Brothers", "Tri Pointe Homes", "Beazer Homes", "Centex", "Pulte Homes",
  "Del Webb", "Lennar", "D.R. Horton", "KB Home", "M/I Homes", "Meritage Homes", "Taylor Morrison",
  "Ashton Woods", "Pacesetter Homes", "Impression Homes", "Sandlin Homes", "Our Country Homes",
  "John Houston Homes", "Antares Homes", "Windsor Homes", "Normandy Homes", "Southgate Homes",
  "Risland Homes", "GFO Home", "Olivia Clarke Homes", "Landsea Homes", "Century Communities",
  "UnionMain Homes", "Mattamy Homes", "Rockhill Homes", "Kindred Homes", "Graham Hart Home Builder",
];
const NORM_LEXICON = BUILDER_LEXICON.map((b) => ({ canonical: b, needle: ` ${norm(b)} ` }));
const lexiconMatch = (text: string) => {
  const hay = ` ${norm(text)} `;
  return NORM_LEXICON.filter((b) => hay.includes(b.needle)).map((b) => b.canonical);
};
const builderLike = (name: string) =>
  /\bHOMES\b/.test(norm(name)) &&
  !/\b(REALTY|REAL ESTATE|REALTORS|BROKERAGE|GROUP LLC|C21|CENTURY 21|KELLER WILLIAMS|COLDWELL|COMPASS|EBBY|SOTHEBY S?|FINE HOMES|RE MAX|REMAX|EXP)\b/.test(norm(name));

/* quick-move-in: same heuristic as the NB-1 stats snapshot */
const READY_NOW = /\b(ready now|move[- ]in ready|quick move[- ]in|immediate (move|occupancy)|completed?)\b/i;

/* ---- query bounds ---------------------------------------------------------
   New-construction scope matches the NB pipeline: year_built >= 2025.
   Page caps keep a pathological query from walking the whole store —
   hitting a cap sets `truncated` so the portal SAYS the scan was partial
   instead of presenting a partial count as complete. */
const YEAR_MIN = 2025;
const PAGE = 1000;
const MAX_CITY_PAGES = 5;   // per-city detail scan
const MAX_METRO_PAGES = 12; // metro-wide homonym scan (slim columns)
const MAX_LIST = 12;        // aliases/builders/homonyms shown & stored

export type CommunityLookup = {
  query: { name: string; citySlug: string; normalizedName: string; yearMin: number };
  matched: boolean;
  activeCount: number;
  pendingCount: number;
  quickMoveInEst: number;
  floorPrice: number | null;
  /** Active floor rounded DOWN to the $10K band, e.g. "$230s". */
  suggestedFromLabel: string | null;
  suggestedBuildersCount: number | null;
  buildersObserved: string[];
  aliases: string[];
  homonyms: { citySlug: string | null; cityName: string; count: number }[];
  truncated: boolean;
  scannedAt: string;
};

type CityRow = {
  standard_status: string | null;
  year_built: number | null;
  list_price: number | null;
  subdivision: string | null;
  list_office: string | null;
  remarks: string | null;
};

export async function lookupCommunity(name: string, citySlug: string): Promise<CommunityLookup | { error: string }> {
  const city = cities.find((c) => c.slug === citySlug);
  if (!city) return { error: `Unknown city "${citySlug}"` };
  const target = normalizeSubdivision(name);
  if (!target || target.length < 3) return { error: "Enter a community name (3+ characters) to look up" };

  const db = getSupabaseAdmin();
  if (!db) return { error: "Listings store not configured" };

  let truncated = false;

  // 1. city-scoped detail scan (Active + Pending/AUC, new construction)
  const cityRows: CityRow[] = [];
  for (let page = 0; page < MAX_CITY_PAGES; page++) {
    const { data, error } = await db
      .from("listings")
      .select(
        "standard_status, year_built, list_price, subdivision:raw->>SubdivisionName, list_office:raw->>ListOfficeName, remarks:raw->>PublicRemarks"
      )
      .eq("city", city.name) // listings.city holds the NAME, not the slug
      .gte("year_built", YEAR_MIN)
      .in("standard_status", ["Active", "Pending", "ActiveUnderContract"])
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { error: `Listings query failed: ${error.message}` };
    cityRows.push(...((data ?? []) as CityRow[]));
    if ((data ?? []).length < PAGE) break;
    if (page === MAX_CITY_PAGES - 1) truncated = true;
  }

  const mine = cityRows.filter((r) => normalizeSubdivision(r.subdivision) === target);
  const active = mine.filter((r) => r.standard_status === "Active");
  const pending = mine.filter((r) => r.standard_status === "Pending" || r.standard_status === "ActiveUnderContract");
  const thisYear = new Date().getUTCFullYear();
  const quick = active.filter((r) => (r.year_built ?? 0) >= thisYear && READY_NOW.test(r.remarks ?? ""));

  const prices = active.map((r) => r.list_price ?? 0).filter((p) => p > 0);
  const floor = prices.length ? Math.min(...prices) : null;

  const builders = new Set<string>();
  for (const r of active) {
    for (const b of lexiconMatch(`${r.list_office ?? ""} ${r.remarks ?? ""}`)) builders.add(b);
    const office = (r.list_office ?? "").trim();
    if (office && !lexiconMatch(office).length && builderLike(office)) builders.add(norm(office));
  }

  const aliases = [...new Set(mine.map((r) => (r.subdivision ?? "").trim()).filter(Boolean))].sort();

  // 2. metro-wide slim scan for cross-city homonyms
  const homonymCount = new Map<string, number>();
  for (let page = 0; page < MAX_METRO_PAGES; page++) {
    const { data, error } = await db
      .from("listings")
      .select("city, subdivision:raw->>SubdivisionName")
      .gte("year_built", YEAR_MIN)
      .in("standard_status", ["Active", "Pending", "ActiveUnderContract"])
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { error: `Homonym scan failed: ${error.message}` };
    for (const r of (data ?? []) as { city: string | null; subdivision: string | null }[]) {
      if (normalizeSubdivision(r.subdivision) !== target) continue;
      const cityName = (r.city ?? "").trim();
      if (norm(cityName) === norm(city.name)) continue; // same city = the match itself
      homonymCount.set(cityName, (homonymCount.get(cityName) ?? 0) + 1);
    }
    if ((data ?? []).length < PAGE) break;
    if (page === MAX_METRO_PAGES - 1) truncated = true;
  }
  const nameToSlug = new Map(cities.map((c) => [norm(c.name), c.slug]));
  const homonyms = [...homonymCount.entries()]
    .map(([cityName, count]) => ({ citySlug: nameToSlug.get(norm(cityName)) ?? null, cityName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_LIST);

  return {
    query: { name, citySlug, normalizedName: target, yearMin: YEAR_MIN },
    matched: mine.length > 0,
    activeCount: active.length,
    pendingCount: pending.length,
    quickMoveInEst: quick.length,
    floorPrice: floor,
    suggestedFromLabel: floor ? `$${Math.floor(floor / 10000) * 10}s` : null,
    suggestedBuildersCount: active.length ? builders.size : null,
    buildersObserved: [...builders].slice(0, MAX_LIST),
    aliases: aliases.slice(0, MAX_LIST),
    homonyms,
    truncated,
    scannedAt: new Date().toISOString(),
  };
}
