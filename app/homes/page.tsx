import type { Metadata } from "next";
import { isLiveMls, parseSearchFilters } from "@/lib/mls";
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

export default async function HomesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const authFailed = (Array.isArray(params.auth) ? params.auth[0] : params.auth) === "failed";
  return <MapRoom query={parseSearchFilters(params)} authFailed={authFailed} />;
}
