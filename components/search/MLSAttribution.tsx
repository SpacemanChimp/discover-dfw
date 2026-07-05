/* Reserved IDX attribution slot. MLS rules (NTREIS) require the listing
   brokerage's name displayed with each listing; the mock feed carries none,
   so the reservation itself is shown until Trestle supplies attributionText
   (or listingBrokerName / listingOfficeName). */
export default function MLSAttribution({
  attributionText,
  listingBrokerName,
  listingId,
  mlsSource,
  compact,
}: {
  attributionText: string | null;
  listingBrokerName: string | null;
  listingId: string;
  mlsSource: string;
  compact?: boolean;
}) {
  const line =
    attributionText ??
    (listingBrokerName
      ? `LISTING COURTESY OF ${listingBrokerName.toUpperCase()}`
      : "LISTING COURTESY OF — IDX ATTRIBUTION RESERVED");
  return (
    <div
      className="font-mono"
      style={{
        fontSize: compact ? 8 : 9,
        letterSpacing: ".14em",
        color: "rgba(29,25,19,.45)",
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <span>{attributionText ? attributionText.toUpperCase() : line}</span>
      <span>
        MLS# {listingId} · {mlsSource === "MOCK" ? "PLACEHOLDER" : mlsSource}
      </span>
    </div>
  );
}
