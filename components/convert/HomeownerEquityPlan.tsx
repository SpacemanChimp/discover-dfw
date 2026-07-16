import ConversionPanel from "./ConversionPanel";

/* City and neighborhood pages: for people who already own here. */
export default function HomeownerEquityPlan(props: { citySlug?: string | null; community?: string | null }) {
  return <ConversionPanel intent="homeowner-equity-plan" {...props} />;
}
