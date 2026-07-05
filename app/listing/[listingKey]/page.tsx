import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { bySlug, countyById } from "@/lib/dfw-data";
import { getMlsProvider } from "@/lib/mls";
import { mockListings } from "@/data/mock-listings";
import ListingDetailDossier from "@/components/search/ListingDetailDossier";
import SearchNav from "@/components/search/SearchNav";
import MLSComplianceFooter from "@/components/search/MLSComplianceFooter";

export function generateStaticParams() {
  return mockListings.map((l) => ({ listingKey: l.listingKey }));
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
    title: `${l.unparsedAddress}, ${city?.name || l.citySlug}, TX — $${l.listPrice.toLocaleString("en-US")}`,
    description: `${l.bedsTotal} bed, ${l.bathsTotal} bath, ${l.livingAreaSqft.toLocaleString("en-US")} sqft ${l.propertyType.toLowerCase()} in ${l.neighborhood}. ${l.editorialNote}`,
    /* NOINDEX — mock listing with a fictional address; flip with live IDX. */
    robots: { index: false, follow: true },
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
  const city = bySlug[listing.citySlug];
  if (!city) notFound();
  const county = countyById[city.county];

  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      <SearchNav />
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "16px 4vw 0" }}>
        <Link
          href={`/city/${city.slug}/homes`}
          className="city-back font-mono"
          style={{ fontSize: 10, letterSpacing: ".18em", color: "rgba(29,25,19,.6)", textDecoration: "none" }}
        >
          ← ALL {city.name.toUpperCase()} HOMES
        </Link>
      </div>
      <ListingDetailDossier listing={listing} city={city} countyName={county.name} />
      <MLSComplianceFooter asOf={listing.mlsLastUpdated} />
    </div>
  );
}
