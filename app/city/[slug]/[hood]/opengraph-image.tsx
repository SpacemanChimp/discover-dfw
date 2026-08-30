import { ImageResponse } from "next/og";
import { bySlug } from "@/lib/dfw-data";
import { hoodsForCity } from "@/lib/hoods";
import { OgCard, OG_SIZE } from "@/lib/og-card";

/* Neighborhood/new-build guide social card: the community name over the
   field-guide frame. Canonical dataset names only — no figures, no photos. */

export const alt = "Neighborhood guide social preview";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string; hood: string }> }) {
  const { slug, hood } = await params;
  const c = bySlug[slug];
  const h = c ? hoodsForCity(c).find((x) => x.slug === hood) : undefined;
  return new ImageResponse(
    <OgCard
      kicker={h?.newBuild ? "New-build community guide" : "Neighborhood guide"}
      title={h && c ? `${h.name}` : "Discover DFW"}
      subtitle={h && c ? `${h.name} in ${c.name}, Texas — the field-guide read on the neighborhood and its market.` : undefined}
    />,
    size
  );
}
