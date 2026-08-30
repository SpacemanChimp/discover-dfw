import { ImageResponse } from "next/og";
import { OgCard, OG_SIZE } from "@/lib/og-card";

/* Twitter/X large-summary card — same branded frame as the OG default. */

export const alt = "Discover DFW — a field guide to North Texas real estate";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <OgCard kicker="The field guide" title="Discover DFW" subtitle="Every city, every county, one clickable map of North Texas real estate." />,
    size
  );
}
