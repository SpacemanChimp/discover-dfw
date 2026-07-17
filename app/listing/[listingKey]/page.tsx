import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { bySlug, countyById } from "@/lib/dfw-data";
import { getMlsProvider, isLiveMls } from "@/lib/mls";
import { getListingSchools } from "@/lib/mls/trestle";
import { mockListings } from "@/data/mock-listings";
import ListingDetailDossier from "@/components/search/ListingDetailDossier";
import { getCityMarketMetricSet } from "@/lib/market/metrics";
import NearbyListings from "@/components/listing/NearbyListings";
import SearchNav from "@/components/search/SearchNav";
import MLSComplianceFooter from "@/components/search/MLSComplianceFooter";

/* Live mode: tens of thousands of listings — render on demand, refresh
   every 15 minutes (well inside the 12-hour IDX staleness ceiling). */
export const revalidate = 900;

export function generateStaticParams() {
  return isLiveMls ? [] : mockListings.map((l) => ({ listingKey: l.listingKey }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ listingKey: string }>;
}): Promise<Metadata> {
  const { listingKey } = await params;
  const l = await getMlsProvider().getListingByKey(listingKey);
  if (!l) return { title: "Listing" };
  const city = bySlug[l.citySlug];
  return {
    title: `${l.unparsedAddress}, ${city?.name || l.cityName}, TX — $${l.listPrice.toLocaleString("en-US")}`,
    description: `${l.bedsTotal} bed, ${l.bathsTotal} bath, ${l.livingAreaSqft.toLocaleString("en-US")} sqft ${l.propertyType.toLowerCase()} in ${l.neighborhood}. ${l.editorialNote}`,
    alternates: { canonical: `/listing/${l.listingKey}` },
    /* Indexable only on the live NTREIS feed — mock addresses are fiction. */
    robots: { index: isLiveMls, follow: true },
  };
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ listingKey: string }>;
}) {
  const { listingKey } = await params;
  const listing = await getMlsProvider().getListingByKey(listingKey);
  if (!listing) notFound();
  // A listing in a metro municipality WITHOUT an editorial city profile
  // (Corinth, Copper Canyon, …) is still a valid listing — render it with
  // honest fallback context (its own city/county), not a 404. City-profile
  // modules (median, "know the city") are omitted rather than fabricated.
  const city = bySlug[listing.citySlug] ?? null;
  const county = city ? countyById[city.county] : null;
  const countyName = county?.name ?? listing.county ?? "";
  const cityMedian = city
    ? (await getCityMarketMetricSet(city.slug))?.metrics.median_active_list_price ?? null
    : null;

  /* MLS-reported schools: the provider carries them when the record (or the
     replicated raw) has them; otherwise supplement with a live six-field
     fetch. Never inferred, never fails the page — null renders the
     "not reported" note. */
  const schools = listing.schools ?? (isLiveMls ? await getListingSchools(listing.listingKey) : null);

  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      <SearchNav />
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "16px 4vw 0" }}>
        <Link
          href={city ? `/city/${city.slug}/homes` : "/homes"}
          className="city-back font-mono"
          style={{
            fontSize: 10,
            letterSpacing: ".18em",
            color: "rgba(29,25,19,.65)",
            textDecoration: "none",
            display: "inline-block",
            padding: "10px 0",
          }}
        >
          ← {city ? `ALL ${city.name.toUpperCase()} HOMES` : "BACK TO SEARCH"}
        </Link>
      </div>
      <ListingDetailDossier
        listing={listing}
        city={city}
        countyName={countyName}
        schools={schools}
        liveMls={isLiveMls}
        cityMedian={cityMedian}
      />
      <NearbyListings listing={listing} />
      <MLSComplianceFooter asOf={listing.mlsLastUpdated} />
    </div>
  );
}
