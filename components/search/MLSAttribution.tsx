/* Reserved IDX attribution slot. MLS rules (NTREIS) require the listing
   brokerage's name displayed with each listing; the mock feed has none, so
   the reservation itself is shown until Trestle supplies courtesyOf. */
export default function MLSAttribution({
  courtesyOf,
  listingKey,
  compact,
}: {
  courtesyOf: string | null;
  listingKey: string;
  compact?: boolean;
}) {
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
      <span>
        {courtesyOf
          ? `LISTING COURTESY OF ${courtesyOf.toUpperCase()}`
          : "LISTING COURTESY OF — IDX ATTRIBUTION RESERVED"}
      </span>
      <span>MLS# {listingKey.replace("MOCK-", "")} · PLACEHOLDER</span>
    </div>
  );
}
