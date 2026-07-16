import ConversionPanel from "./ConversionPanel";

/* City reports + homepage: narrow ninety cities to a practical shortlist. */
export default function BuildMyShortlist(props: { citySlug?: string | null; community?: string | null }) {
  return <ConversionPanel intent="build-my-shortlist" {...props} />;
}
