import type { Metadata } from "next";
import { isLiveMls, parseSearchFilters } from "@/lib/mls";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import LandRoom from "@/components/search/LandRoom";
import { leadBackendReady } from "@/lib/convert/config";

/* One indexable /land destination. Filtered query combinations self-
   canonicalize back to /land (mirrors /homes), so facets never spawn
   crawlable duplicates. Indexable only on the live NTREIS feed. */
export const metadata: Metadata = {
  // `absolute` so the layout's "%s | Discover DFW" template doesn't double the
  // site suffix already baked into this exact title
  title: { absolute: "DFW Land for Sale - Lots, Acreage & Buildable Land | Discover DFW" },
  description:
    "Search live NTREIS listings for residential lots, acreage, farms, ranches, and undeveloped land across North Texas.",
  alternates: { canonical: "/land" },
  robots: { index: isLiveMls, follow: true },
};

/* CollectionPage + breadcrumb only on the live feed — no fake Offer / rating /
   review / availability data; just an honest description of the collection. */
const jsonLd = isLiveMls
  ? [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "DFW Land for Sale — Lots, Acreage & Buildable Land",
        url: `${SITE_URL}/land`,
        description:
          "Live NTREIS listings for residential lots, acreage, farms, ranches, and undeveloped land across the eight-county North Texas metro.",
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Discover DFW", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Land for Sale", item: `${SITE_URL}/land` },
        ],
      },
    ]
  : null;

export default async function LandPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;
  const view = rawView === "list" || rawView === "map" ? rawView : "map";
  // land:true is forced downstream in LandRoom regardless of the URL
  const query = { ...parseSearchFilters(params), land: true };
  return (
    <>
      {jsonLd &&
        jsonLd.map((block, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }} />
        ))}
      <LandRoom query={query} view={view} leadHelp={leadBackendReady()} />
    </>
  );
}
