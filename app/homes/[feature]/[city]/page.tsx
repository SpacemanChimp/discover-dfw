import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLiveMls } from "@/lib/mls";
import { parseSearchFilters } from "@/lib/mls/url";
import {
  FEATURES,
  CITY_FEATURE_REGISTRY,
  cityFeaturePublished,
  isFeatureSlug,
  featurePath,
} from "@/lib/mls/feature-search";
import FeatureRoom from "@/components/search/FeatureRoom";
import { bySlug, countyById } from "@/lib/dfw-data";
import { SITE_URL } from "@/lib/site";

/* /homes/<feature>/<city> — city-scoped feature searches. BOTH predicates
   (canonical city + feature) are forced server-side in FeatureRoom.
   PUBLISHING: only registry-approved combinations are indexable and in
   the sitemap; every other valid combination still works for users but is
   noindex,follow — the explicit registry decides publication, live
   inventory only decides the results. Unknown features or cities 404. */

export const revalidate = 900;

export function generateStaticParams() {
  return CITY_FEATURE_REGISTRY.map((e) => ({ feature: e.feature, city: e.city }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ feature: string; city: string }>;
}): Promise<Metadata> {
  const { feature, city } = await params;
  const c = bySlug[city];
  if (!isFeatureSlug(feature) || !c) return {};
  const def = FEATURES[feature];
  const countyName = countyById[c.county]?.name ?? c.county;
  const published = cityFeaturePublished(feature, city);
  return {
    title: { absolute: def.titleCity(c.name) },
    description: def.descriptionCity(c.name, countyName),
    alternates: { canonical: featurePath(feature, city) },
    // outside the reviewed registry: reachable, crawlable links honored,
    // never indexed — and never in the sitemap
    robots: { index: isLiveMls && published, follow: true },
  };
}

export default async function FeatureCityPage({
  params,
  searchParams,
}: {
  params: Promise<{ feature: string; city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { feature, city } = await params;
  const c = bySlug[city];
  if (!isFeatureSlug(feature) || !c) notFound();
  const sp = await searchParams;
  const def = FEATURES[feature];
  const view = sp.view === "list" ? ("list" as const) : ("map" as const);
  const published = cityFeaturePublished(feature, city);

  const jsonLd =
    isLiveMls && published
      ? [
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: def.h1City(c.name),
            description: def.descriptionCity(c.name, countyById[c.county]?.name ?? c.county),
            url: `${SITE_URL}${featurePath(feature, city)}`,
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Discover DFW", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "Home Features", item: `${SITE_URL}/homes/features` },
              { "@type": "ListItem", position: 3, name: def.h1, item: `${SITE_URL}${featurePath(feature)}` },
              { "@type": "ListItem", position: 4, name: def.h1City(c.name), item: `${SITE_URL}${featurePath(feature, city)}` },
            ],
          },
        ]
      : null;

  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
      <FeatureRoom feature={feature} citySlug={city} query={parseSearchFilters(sp)} view={view} />
    </>
  );
}
