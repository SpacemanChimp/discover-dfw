import { ImageResponse } from "next/og";
import { FEATURES, isFeatureSlug } from "@/lib/mls/feature-search";
import { OgCard, OG_SIZE } from "@/lib/og-card";

/* Feature-search social card (metro and city pages share it): the literal
   search headline over the field-guide frame. */

export const alt = "Feature search social preview";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ feature: string }> }) {
  const { feature } = await params;
  const def = isFeatureSlug(feature) ? FEATURES[feature] : null;
  return new ImageResponse(
    <OgCard
      kicker="Live MLS search"
      title={def ? def.h1 : "Search DFW homes"}
      subtitle={def ? "Matched on structured MLS fields and refreshed from the NTREIS feed all day." : undefined}
    />,
    size
  );
}
