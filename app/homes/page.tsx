import type { Metadata } from "next";
import { parseSearchFilters } from "@/lib/mls";
import MapRoom from "@/components/search/MapRoom";

/* NOINDEX until the live IDX feed replaces mock inventory — fake listings
   must never enter the index. Flip to indexable in Phase 3. */
export const metadata: Metadata = {
  title: "Search Homes for Sale in DFW — The Map Room",
  description:
    "Browse Dallas–Fort Worth homes city by city — listing rail, illustrated metroplex map, and the field-guide voice carried into MLS search.",
  robots: { index: false, follow: true },
};

export default async function HomesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <MapRoom query={parseSearchFilters(params)} />;
}
