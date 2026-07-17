import type { Metadata } from "next";
import { isLiveMls, parseSearchFilters } from "@/lib/mls";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import NewBuildsRoom from "@/components/search/NewBuildsRoom";

/* One indexable /new-builds destination: live new-construction MLS search +
   the editorial community directory + buyer education + one CTA. Filtered
   query combinations self-canonicalize back to /new-builds (mirrors /homes
   and /land), so facets never spawn crawlable duplicates. Indexable only on
   the live NTREIS feed. */
export const metadata: Metadata = {
  title: { absolute: "DFW New Construction Homes for Sale - New Builds & Communities | Discover DFW" },
  description:
    "Search live NTREIS new-construction listings across Dallas–Fort Worth and browse master-planned communities by county, with honest new-build buyer guidance.",
  alternates: { canonical: "/new-builds" },
  robots: { index: isLiveMls, follow: true },
};

/* CollectionPage + breadcrumb only on the live feed — no fake Offer / Product
   / rating / review; just an honest description of the collection. */
const jsonLd = isLiveMls
  ? [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "DFW New Construction Homes for Sale — New Builds & Communities",
        url: `${SITE_URL}/new-builds`,
        description:
          "Live NTREIS new-construction listings and master-planned communities across the Dallas–Fort Worth metro.",
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Discover DFW", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "New Construction Homes", item: `${SITE_URL}/new-builds` },
        ],
      },
    ]
  : null;

export default async function NewBuildsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;
  const view = rawView === "list" || rawView === "map" ? rawView : "map";
  // newBuildsOnly is forced downstream in NewBuildsRoom regardless of the URL
  const query = { ...parseSearchFilters(params), newBuildsOnly: true };
  return (
    <>
      {jsonLd &&
        jsonLd.map((block, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }} />
        ))}
      <NewBuildsRoom query={query} view={view} />
    </>
  );
}
