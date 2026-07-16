import ConversionPanel from "./ConversionPanel";

/* City reports + comparison surfaces: this city vs. the one they're eyeing. */
export default function CompareThisCity(props: { citySlug?: string | null; community?: string | null }) {
  return <ConversionPanel intent="compare-this-city" {...props} />;
}
