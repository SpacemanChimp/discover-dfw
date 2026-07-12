import type { Metadata } from "next";
import { isLiveMls, parseSearchFilters } from "@/lib/mls";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import MapRoom from "@/components/search/MapRoom";

/* Indexable only on the live NTREIS feed — fictional mock inventory must
   never enter the index. Filtered query URLs canonicalize to /homes. */
export const metadata: Metadata = {
  title: "Search Homes for Sale in DFW — The Map Room",
  description:
    "Browse Dallas–Fort Worth homes city by city — listing rail, illustrated metroplex map, and the field-guide voice carried into MLS search.",
  alternates: { canonical: "/homes" },
  robots: { index: isLiveMls, follow: true },
};

/* CollectionPage only on the live feed — mirrors the robots.index gate above;
   fictional mock inventory never gets structured data. */
const jsonLd = isLiveMls
  ? {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Search Homes for Sale in DFW — The Map Room",
      url: `${SITE_URL}/homes`,
      description:
        "Live MLS search for Dallas–Fort Worth homes: listing rail, illustrated metroplex map, city and neighborhood filters.",
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    }
  : null;

export default async function HomesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const authFailed = (Array.isArray(params.auth) ? params.auth[0] : params.auth) === "failed";
  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <MapRoom query={parseSearchFilters(params)} authFailed={authFailed} />
    </>
  );
}
