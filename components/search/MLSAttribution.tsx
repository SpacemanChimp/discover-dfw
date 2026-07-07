/* Per-listing IDX attribution row: broker courtesy line (left) + MLS number
   and source (right). All copy flows from lib/compliance — PENDING
   BROKER/NTREIS/LEGAL REVIEW — so the required wording lands in one file.
   Client-safe: used inside the Ledger card's client boundary. */
import ListingBrokerAttribution from "@/components/compliance/ListingBrokerAttribution";
import { MLS_SOURCE } from "@/lib/compliance";

export default function MLSAttribution({
  attributionText,
  listingBrokerName,
  listingId,
  mlsSource,
  compact,
}: {
  attributionText: string | null;
  listingBrokerName: string | null;
  /** Omit for the group-level slot beneath a set of listings. */
  listingId?: string;
  mlsSource: string;
  compact?: boolean;
}) {
  return (
    <div
      className="font-mono"
      style={{
        fontSize: compact ? 8 : 9,
        letterSpacing: ".14em",
        color: "rgba(29,25,19,.62)",
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <ListingBrokerAttribution
        attributionText={attributionText}
        listingBrokerName={listingBrokerName}
        group={!listingId}
      />
      <span>
        {listingId ? `MLS# ${listingId} · ` : "SOURCE: "}
        {mlsSource === "MOCK" ? MLS_SOURCE.mock : mlsSource}
      </span>
    </div>
  );
}
