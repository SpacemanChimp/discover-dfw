import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cities, bySlug, countyById } from "@/lib/dfw-data";
import { parseSearchFilters } from "@/lib/mls";
import MapRoom from "@/components/search/MapRoom";

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
    description: `Browse active listings in ${c.name}, TX (${county.name} County) with the Discover DFW map room — filters, price pins, and the full ${c.name} city report one click away.`,
    /* NOINDEX until live IDX data replaces the mock feed (Phase 3). */
    robots: { index: false, follow: true },
  };
}

export default async function CityHomesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  if (!bySlug[slug]) notFound();
  return <MapRoom query={parseSearchFilters(sp)} citySlug={slug} />;
}
