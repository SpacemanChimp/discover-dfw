/* Zero-results state for the listing rail — editorial, never a dead end.
   The `land` variant keeps the reader inside land search: it suggests
   widening acreage/price or dropping a category, never a pivot to houses. */
export default function EmptyResultsState({ cityName, land = false }: { cityName?: string; land?: boolean }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 12px" }}>
      <div
        className="font-mono"
        style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".24em", color: "#C13E17" }}
      >
        {land ? "NO PARCELS ON THE LEDGER" : "NOTHING ON THE LEDGER"}
      </div>
      <div
        className="font-serif"
        style={{ fontStyle: "italic", fontSize: 19, color: "rgba(29,25,19,.7)", marginTop: 10 }}
      >
        {land
          ? `No land matches that combination${cityName ? ` in ${cityName}` : ""} — yet.`
          : `Nothing matches that combination${cityName ? ` in ${cityName}` : ""} — yet.`}
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "rgba(29,25,19,.65)" }}>
        {land
          ? "Widen the acreage or price, drop a category, or clear the filters to see every parcel."
          : "Loosen a filter, or save the search and we’ll watch the market for you."}
      </p>
    </div>
  );
}
