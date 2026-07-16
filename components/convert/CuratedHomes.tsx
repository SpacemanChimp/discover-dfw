import ConversionPanel from "./ConversionPanel";

/* City, neighborhood, and homes-search pages: hand-picked over firehose. */
export default function CuratedHomes(props: { citySlug?: string | null; community?: string | null }) {
  return <ConversionPanel intent="curated-homes" {...props} />;
}
