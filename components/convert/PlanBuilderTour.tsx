import ConversionPanel from "./ConversionPanel";

/* New-construction pages: one efficient route through the right models. */
export default function PlanBuilderTour(props: { citySlug?: string | null; community?: string | null }) {
  return <ConversionPanel intent="plan-builder-tour" {...props} />;
}
