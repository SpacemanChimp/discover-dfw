import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { dfwCities, cityBySlug } from "@/data/dfw-cities";
import { normalizeSchoolKey, schoolMatchToken } from "@/lib/mls/school-fields";
import type { Suggestion, SchoolLevel } from "@/lib/search/suggest";

/* Live MLS-sourced suggestions for the search typeahead: listing ADDRESSES,
   plus SCHOOLS and DISTRICTS drawn from the distinct values actually reported
   across on-market listings (mls_school_facets, migration 0017) — never the
   editorial school list. Cities / neighborhoods / new-builds stay in the
   client static index (lib/search/suggest); those are navigational.

   Selects explicit columns only — NEVER the server-only `raw` blob. Public,
   dynamic, briefly CDN-cached. */

export const dynamic = "force-dynamic";

const ONMARKET = ["Active", "ActiveUnderContract", "ComingSoon", "Pending"];
const CITY_NAMES = dfwCities.map((c) => c.name);
const nameToSlug = new Map(dfwCities.map((c) => [c.name.toLowerCase(), c.slug]));

const LEVEL_WORD: Record<SchoolLevel, string> = { elementary: "ELEMENTARY SCHOOL", middle: "MIDDLE SCHOOL", high: "HIGH SCHOOL" };

type SchoolFacet = { level: SchoolLevel; name: string; n: number };
type DistrictFacet = { name: string; n: number };
type Facets = { schools: SchoolFacet[]; districts: DistrictFacet[] };

/* The distinct school/district values reported across on-market listings —
   one aggregate read (bypasses the 1,000-row cap), cached for an hour. This
   is the authoritative set of what is searchable. */
const loadFacets = unstable_cache(
  async (): Promise<Facets> => {
    const db = getSupabaseAdmin();
    if (!db) return { schools: [], districts: [] };
    const { data, error } = await db.rpc("mls_school_facets");
    if (error || !data) return { schools: [], districts: [] };
    return {
      schools: Array.isArray(data.schools) ? data.schools : [],
      districts: Array.isArray(data.districts) ? data.districts : [],
    };
  },
  ["mls-school-facets"],
  { revalidate: 3600 }
);

function plural(n: number) {
  return `${n.toLocaleString("en-US")} listing${n === 1 ? "" : "s"}`;
}

/* Rank a facet against the normalized query: whole-string start beats a
   word-start beats a loose contains; ties break toward more listings. */
function facetScore(norm: string, nq: string): number {
  if (norm === nq) return 100;
  if (norm.startsWith(nq)) return 70;
  if (norm.split(" ").some((w) => w.startsWith(nq))) return 45;
  if (norm.includes(nq)) return 20;
  return -1;
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ suggestions: [] });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ suggestions: [] });

  const nq = normalizeSchoolKey(q);
  const coreQ = schoolMatchToken(q).toLowerCase();

  // ---- schools + districts from MLS facets (authoritative) ----
  let schoolHits: Suggestion[] = [];
  let districtHits: Suggestion[] = [];
  try {
    const facets = await loadFacets();

    schoolHits = facets.schools
      .map((f) => {
        const norm = normalizeSchoolKey(f.name);
        // match on the normalized name OR the level-stripped core token, so
        // "guyer" and "guyer high school" both find the MLS value "Guyer"
        let score = facetScore(norm, nq);
        if (score < 0 && coreQ) {
          const core = schoolMatchToken(f.name).toLowerCase();
          if (core && core.includes(coreQ)) score = 15;
        }
        return { f, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score || b.f.n - a.f.n)
      .slice(0, 5)
      .map(({ f }): Suggestion => ({
        kind: "school",
        label: f.name,
        sublabel: `${LEVEL_WORD[f.level]} · ${plural(f.n)}`,
        href: `/homes?${new URLSearchParams({ school: f.name, slevel: f.level }).toString()}`,
        hay: normalizeSchoolKey(f.name),
        schoolName: f.name,
        schoolLevel: f.level,
      }));

    districtHits = facets.districts
      .map((f) => ({ f, score: facetScore(normalizeSchoolKey(f.name), nq) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score || b.f.n - a.f.n)
      .slice(0, 4)
      .map(({ f }): Suggestion => ({
        kind: "district",
        label: f.name,
        sublabel: `SCHOOL DISTRICT · ${plural(f.n)}`,
        href: `/homes?${new URLSearchParams({ district: f.name }).toString()}`,
        hay: normalizeSchoolKey(f.name),
        districtName: f.name,
      }));
  } catch {
    /* facets unavailable — addresses still return */
  }

  // ---- listing addresses (indexed prefix tsquery over search_tsv) ----
  let addressHits: Suggestion[] = [];
  if (q.length >= 3) {
    const words = q.replace(/[():|&!*<>\\]/g, " ").split(/\s+/).filter(Boolean);
    if (words.length) {
      const tsquery = words.map((w) => `${w}:*`).join(" & ");
      try {
        const { data } = await db
          .from("listings")
          .select("listing_key, unparsed_address, city")
          .in("standard_status", ONMARKET)
          .in("city", CITY_NAMES)
          .textSearch("search_tsv", tsquery)
          .order("days_on_market", { ascending: true, nullsFirst: false })
          .limit(5);
        addressHits = (data ?? [])
          .filter((r) => /^\d+$/.test(r.listing_key))
          .map((r): Suggestion => {
            const slug = nameToSlug.get((r.city || "").toLowerCase());
            const cityName = slug ? cityBySlug[slug]?.name : r.city;
            return {
              kind: "address",
              label: r.unparsed_address,
              sublabel: cityName ? `${cityName}, TX` : "TX",
              href: `/listing/${r.listing_key}`,
              hay: "",
            };
          });
      } catch {
        /* addresses optional */
      }
    }
  }

  const suggestions = [...schoolHits, ...districtHits, ...addressHits];
  return NextResponse.json(
    { suggestions },
    { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } }
  );
}
