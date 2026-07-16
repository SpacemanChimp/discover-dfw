import ConversionPanel from "./ConversionPanel";

/* Master-planned-community and builder pages: verified intel before the
   model-home visit. */
export default function NewBuildIncentives(props: { citySlug?: string | null; community?: string | null }) {
  return <ConversionPanel intent="new-build-incentives" {...props} />;
}
