import type { Metadata } from "next";
import { isLiveMls, parseSearchFilters } from "@/lib/mls";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import MapRoom from "@/components/search/MapRoom";
import { leadBackendReady } from "@/lib/convert/config";

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
  /* ?view=list|map is the explicit request; phones otherwise open on the map */
  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;
  const view = rawView === "list" || rawView === "map" ? rawView : "map";
  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <MapRoom query={parseSearchFilters(params)} authFailed={authFailed} leadHelp={leadBackendReady()} view={view} />
    </>
  );
}
