import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLiveMls } from "@/lib/mls";
import { parseSearchFilters } from "@/lib/mls/url";
import { FEATURES, FEATURE_SLUGS, isFeatureSlug, featurePath } from "@/lib/mls/feature-search";
import FeatureRoom from "@/components/search/FeatureRoom";
import { SITE_URL } from "@/lib/site";

/* /homes/<feature> — the six metro feature searches (Feature Search SEO
   v1). The feature predicates ride AUTHORITATIVE structured MLS fields
   (see lib/mls/feature-search.ts) and are forced server-side in
   FeatureRoom, so the rendered inventory always satisfies the page's
   advertised filter. Unknown slugs 404. Indexable (live feed permitting)
   with a self-canonical — query-string variants never earn their own
   canonical. */

export const revalidate = 900;

export function generateStaticParams() {
  return FEATURE_SLUGS.map((feature) => ({ feature }));
}

export async function generateMetadata({ params }: { params: Promise<{ feature: string }> }): Promise<Metadata> {
  const { feature } = await params;
  if (!isFeatureSlug(feature)) return {};
  const def = FEATURES[feature];
  return {
    title: { absolute: def.title },
    description: def.description,
    alternates: { canonical: featurePath(feature) },
    robots: { index: isLiveMls, follow: true },
  };
}

export default async function FeatureMetroPage({
  params,
  searchParams,
}: {
  params: Promise<{ feature: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { feature } = await params;
  if (!isFeatureSlug(feature)) notFound();
  const sp = await searchParams;
  const def = FEATURES[feature];
  const view = sp.view === "list" ? ("list" as const) : ("map" as const);

  const jsonLd = isLiveMls
    ? [
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: def.h1,
          description: def.description,
          url: `${SITE_URL}${featurePath(feature)}`,
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Discover DFW", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "Home Features", item: `${SITE_URL}/homes/features` },
            { "@type": "ListItem", position: 3, name: def.h1, item: `${SITE_URL}${featurePath(feature)}` },
          ],
        },
      ]
    : null;

  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
      <FeatureRoom feature={feature} query={parseSearchFilters(sp)} view={view} />
    </>
  );
}
