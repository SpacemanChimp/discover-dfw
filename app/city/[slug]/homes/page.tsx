import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cities, bySlug, countyById } from "@/lib/dfw-data";
import { getMlsProvider, isLiveMls, parseSearchFilters, PROPERTY_TYPE_OPTIONS } from "@/lib/mls";
import { searchFiltersToQueryString } from "@/lib/mls/url";
import Pager from "@/components/search/Pager";
import type { SearchFilters } from "@/lib/mls/types";
import SearchNav from "@/components/search/SearchNav";
import SearchToolbar from "@/components/search/SearchToolbar";
import MLSComplianceFooter from "@/components/search/MLSComplianceFooter";
import CityHomesHero from "@/components/city-homes/CityHomesHero";
import CityMarketMiniSnapshot from "@/components/city-homes/CityMarketMiniSnapshot";
import CityHomesList from "@/components/city-homes/CityHomesList";
import type { NearbyCityCount } from "@/components/city-homes/CityHomesEmptyState";

export function generateStaticParams() {
  return cities.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = bySlug[slug];
  if (!c) return { title: "Search Homes" };
  const county = countyById[c.county];
  return {
    title: `Homes for Sale in ${c.name}, TX — Search Listings`,
    description: `Browse active listings in ${c.name}, TX (${county.name} County) — market snapshot, editorial listing cards, and the full ${c.name} city report one click away.`,
    alternates: { canonical: `/city/${c.slug}/homes` },
    /* Indexable only on the live NTREIS feed — never for mock inventory. */
    robots: { index: isLiveMls, follow: true },
  };
}

/* City-specific home search: hero + market mini-snapshot + toolbar-filtered
   inventory, in the field-guide voice. The metro Map Room lives at /homes. */
export default async function CityHomesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const city = bySlug[slug];
  if (!city) notFound();
  const county = countyById[city.county];

  const provider = getMlsProvider();
  const filters: SearchFilters = { ...parseSearchFilters(sp), citySlug: slug };
  const [result, snapshot, countsBySlug] = await Promise.all([
    provider.searchListings(filters),
    provider.getCityMarketSnapshot(slug),
    provider.getActiveCountsByCity(),
  ]);
  if (!snapshot) notFound();

  const propertyTypes = PROPERTY_TYPE_OPTIONS;
  const nearby: NearbyCityCount[] = cities
    .filter((c) => c.county === city.county && c.slug !== slug && countsBySlug[c.slug])
    .map((c) => ({ slug: c.slug, name: c.name, count: countsBySlug[c.slug] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      <SearchNav />
      <SearchToolbar query={filters} citySlug={slug} propertyTypes={propertyTypes} />
      {!isLiveMls && (
        <div
          className="font-mono"
          role="note"
          style={{
            textAlign: "center",
            padding: "9px 4vw",
            background: "rgba(217,72,31,.08)",
            borderBottom: "1.5px dashed rgba(217,72,31,.5)",
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: ".2em",
            color: "#D9481F",
          }}
        >
          SAMPLE INVENTORY — EVERY LISTING IS FICTIONAL UNTIL MLS APPROVAL &amp; THE LIVE IDX FEED
        </div>
      )}

      <CityHomesHero snapshot={{ ...snapshot, activeListings: result.total }} />
      <CityMarketMiniSnapshot snapshot={snapshot} />
      <CityHomesList
        listings={result.listings}
        cityName={city.name}
        countyName={county.name}
        mlsSource={result.listings[0]?.mlsSource ?? (isLiveMls ? "NTREIS" : "MOCK")}
        nearby={nearby}
      />
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 4vw 26px" }}>
        <Pager
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
          basePath={`/city/${slug}/homes`}
          qs={searchFiltersToQueryString(filters, true)}
        />
      </div>

      <MLSComplianceFooter asOf={result.mlsLastUpdated} />
    </div>
  );
}
