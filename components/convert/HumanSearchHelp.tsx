import ConversionPanel from "./ConversionPanel";

/* Live home-search experience: a human filter for an overwhelming map. */
export default function HumanSearchHelp(props: { citySlug?: string | null; community?: string | null }) {
  return <ConversionPanel intent="human-search-help" {...props} />;
}
