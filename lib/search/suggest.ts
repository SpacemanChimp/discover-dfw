/* Static search-suggestion index — cities, neighborhoods, new-build
   communities, and schools, all from the editorial dataset that the client
   already bundles (lib/dfw-data). Pure + client-safe: no network, no server
   deps, so the typeahead filters ~600 entries instantly on every keystroke.
   Live listing ADDRESSES come from a separate debounced API
   (/api/search-suggest) since those need the MLS store.

   Unit-tested by scripts/tests/search-suggest.test.mjs. */
import { cities, newBuilds } from "@/lib/dfw-data";
import { slugifyHood } from "@/lib/slug";

export type SuggestionKind = "city" | "neighborhood" | "new-build" | "school" | "address";
export type SchoolLevel = "elementary" | "middle" | "high";

export interface Suggestion {
  kind: SuggestionKind;
  /** primary line, e.g. "Denton High School" */
  label: string;
  /** secondary line, e.g. "Denton, TX" */
  sublabel: string;
  /** where selecting it goes (query string appended to /homes, or a path) */
  href: string;
  /** lowercased haystack for matching */
  hay: string;
  /** city context — lets an embedding toolbar MERGE the pick into active
      filters instead of navigating away (city/school picks) */
  citySlug?: string;
  /** school specifics (for the filter + results-page chip) */
  schoolName?: string;
  schoolLevel?: SchoolLevel;
}

const LEVEL_MAP: Record<string, SchoolLevel> = {
  elementary: "elementary",
  middle: "middle",
  high: "high",
  "junior high": "middle",
  intermediate: "elementary",
};

function qs(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

/* Built once at module load. */
export const SUGGEST_INDEX: Suggestion[] = (() => {
  const out: Suggestion[] = [];
  const nbByKey = new Set(newBuilds.map((nb) => `${nb.city}/${slugifyHood(nb.name)}`));

  for (const c of cities) {
    const cityLabel = `${c.name}, TX`;
    out.push({
      kind: "city",
      label: c.name,
      sublabel: "City · TX",
      href: `/homes?${qs({ city: c.slug })}`,
      hay: `${c.name} tx`.toLowerCase(),
      citySlug: c.slug,
    });
    for (const [hoodName] of c.hoods) {
      const slug = slugifyHood(hoodName);
      // a hood that is also a curated new-build is surfaced as new-build below
      if (nbByKey.has(`${c.slug}/${slug}`)) continue;
      out.push({
        kind: "neighborhood",
        label: hoodName,
        sublabel: `Neighborhood · ${cityLabel}`,
        href: `/city/${c.slug}/${slug}`,
        hay: `${hoodName} ${c.name}`.toLowerCase(),
      });
    }
    for (const [name, level] of c.schools) {
      const lvl = LEVEL_MAP[(level || "").toLowerCase()] || "high";
      out.push({
        kind: "school",
        label: name,
        sublabel: `School · ${cityLabel}`,
        href: `/homes?${qs({ city: c.slug, school: name, slevel: lvl })}`,
        hay: `${name} ${c.name}`.toLowerCase(),
        citySlug: c.slug,
        schoolName: name,
        schoolLevel: lvl,
      });
    }
  }
  for (const nb of newBuilds) {
    const city = cities.find((c) => c.slug === nb.city);
    if (!city) continue;
    out.push({
      kind: "new-build",
      label: nb.name,
      sublabel: `New-build community · ${city.name}, TX`,
      href: `/city/${city.slug}/${slugifyHood(nb.name)}`,
      hay: `${nb.name} ${city.name} new build construction`.toLowerCase(),
    });
  }
  return out;
})();

/* Ranking: prefix of the label wins, then a word-start match, then a loose
   contains. Ties break by kind priority (city > new-build > neighborhood >
   school) so the most navigational hits lead. */
const KIND_RANK: Record<SuggestionKind, number> = { city: 0, "new-build": 1, neighborhood: 2, school: 3, address: 4 };

export function scoreSuggestion(s: Suggestion, q: string): number {
  const label = s.label.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80 - KIND_RANK[s.kind];
  if (s.hay.split(/\s+/).some((w) => w.startsWith(q))) return 55 - KIND_RANK[s.kind];
  if (s.hay.includes(q)) return 30 - KIND_RANK[s.kind];
  return -1;
}

/** Ranked static suggestions for a query. `limit` caps the total; the caller
    interleaves these with live address results. */
export function staticSuggestions(query: string, limit = 8): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return SUGGEST_INDEX.map((s) => ({ s, score: scoreSuggestion(s, q) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.s.label.length - b.s.label.length)
    .slice(0, limit)
    .map((x) => x.s);
}
