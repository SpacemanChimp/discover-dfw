/* Listing-broker attribution — the per-listing "Listing courtesy of …"
   line NTREIS display rules require. Copy comes from lib/compliance
   (PENDING BROKER/NTREIS/LEGAL REVIEW); when the feed supplies neither an
   attribution line nor an office name, the reserved slot itself renders
   so the space is never silently dropped. */
import {
  ATTRIBUTION_RESERVED_GROUP,
  ATTRIBUTION_RESERVED_SINGLE,
  attributionLine,
} from "@/lib/compliance";

export default function ListingBrokerAttribution({
  attributionText,
  listingBrokerName,
  listingOfficeName,
  /** True for the group-level slot beneath a set of listings. */
  group,
}: {
  attributionText: string | null;
  listingBrokerName?: string | null;
  listingOfficeName?: string | null;
  group?: boolean;
}) {
  const office = listingBrokerName || listingOfficeName;
  const line =
    attributionText ??
    (office ? attributionLine(office) : group ? ATTRIBUTION_RESERVED_GROUP : ATTRIBUTION_RESERVED_SINGLE);
  return <span>{line.toUpperCase()}</span>;
}
