/* Static search-suggestion index — cities, neighborhoods, and new-build
   communities, all from the editorial dataset that the client already
   bundles (lib/dfw-data). Pure + client-safe: no network, no server deps, so
   the typeahead filters these navigational entries instantly on every
   keystroke.

   SCHOOLS and DISTRICTS are deliberately NOT here: they are sourced from the
   MLS feed itself (the distinct values actually reported across on-market
   listings) via the debounced /api/search-suggest route, so the searchable
   set can never drift from what the data contains. Live listing ADDRESSES
   come from that same route. */
import { cities, newBuilds } from "@/lib/dfw-data";
import { slugifyHood } from "@/lib/slug";

export type SuggestionKind = "city" | "neighborhood" | "new-build" | "school" | "district" | "address";
export type SchoolLevel = "elementary" | "middle" | "high";

export interface Suggestion {
  kind: SuggestionKind;
  /** primary line, e.g. "Guyer High School" */
  label: string;
  /** secondary line, e.g. "HIGH SCHOOL · 279 listings" */
  sublabel: string;
  /** where selecting it goes (query string appended to /homes, or a path) */
  href: string;
  /** lowercased haystack for matching */
  hay: string;
  /** city context — lets an embedding toolbar MERGE the pick into active
      filters instead of navigating away (city picks) */
  citySlug?: string;
  /** school specifics (MLS-canonical name + level) — for the filter + chip */
  schoolName?: string;
  schoolLevel?: SchoolLevel;
  /** district specifics (MLS-canonical district name) — for the filter + chip */
  districtName?: string;
}

function qs(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

/* Built once at module load. Navigational entries only (cities / hoods /
   new-builds); schools + districts are MLS-sourced server-side. */
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
const KIND_RANK: Record<SuggestionKind, number> = { city: 0, "new-build": 1, neighborhood: 2, school: 3, district: 4, address: 5 };

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
