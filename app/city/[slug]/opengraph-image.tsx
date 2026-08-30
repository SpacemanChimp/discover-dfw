import { ImageResponse } from "next/og";
import { bySlug, countyById } from "@/lib/dfw-data";
import { OgCard, OG_SIZE } from "@/lib/og-card";

/* City-guide social card: the city name over the field-guide frame. Only
   canonical dataset facts appear (name + county) — never figures. */

export const alt = "City guide social preview";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = bySlug[slug];
  const county = c ? (countyById[c.county]?.name ?? c.county) : null;
  return new ImageResponse(
    <OgCard
      kicker={c && county ? `${county} County · The city guide` : "The city guide"}
      title={c ? `${c.name}, Texas` : "Discover DFW"}
      subtitle={c ? `The living field guide to ${c.name} real estate: prices, neighborhoods, schools, and the live market.` : undefined}
    />,
    size
  );
}
