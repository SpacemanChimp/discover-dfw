import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { dfwCities, cityBySlug } from "@/data/dfw-cities";

/* Live listing-ADDRESS suggestions for the search typeahead. Cities /
   neighborhoods / schools come from the client-side static index
   (lib/search/suggest); this route only covers what needs the MLS store.

   Indexed prefix search over the generated search_tsv column (migration
   0008) — each typed word becomes a "word:*" prefix lexeme, so "102 outf"
   matches "102 Outfitters Ct" without the seq-scan/detoast that a raw ILIKE
   on unparsed_address would cost. Selects explicit columns only — NEVER the
   server-only `raw` blob. Public, dynamic, briefly CDN-cached. */

export const dynamic = "force-dynamic";

const CITY_NAMES = dfwCities.map((c) => c.name);
const nameToSlug = new Map(dfwCities.map((c) => [c.name.toLowerCase(), c.slug]));

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 3) return NextResponse.json({ suggestions: [] });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ suggestions: [] });

  // prefix tsquery: strip tsquery operators, then AND the word-prefixes
  const words = q.replace(/[():|&!*<>\\]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return NextResponse.json({ suggestions: [] });
  const tsquery = words.map((w) => `${w}:*`).join(" & ");

  try {
    const { data, error } = await db
      .from("listings")
      .select("listing_key, unparsed_address, city")
      .in("standard_status", ["Active", "ActiveUnderContract", "ComingSoon", "Pending"])
      .in("city", CITY_NAMES)
      .textSearch("search_tsv", tsquery)
      .order("days_on_market", { ascending: true, nullsFirst: false })
      .limit(6);
    if (error) return NextResponse.json({ suggestions: [] });

    const suggestions = (data ?? [])
      .filter((r) => /^\d+$/.test(r.listing_key)) // real NTREIS keys only
      .map((r) => {
        const slug = nameToSlug.get((r.city || "").toLowerCase());
        const cityName = slug ? cityBySlug[slug]?.name : r.city;
        return {
          kind: "address" as const,
          label: r.unparsed_address,
          sublabel: cityName ? `${cityName}, TX` : "TX",
          href: `/listing/${r.listing_key}`,
        };
      });
    return NextResponse.json(
      { suggestions },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } }
    );
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
