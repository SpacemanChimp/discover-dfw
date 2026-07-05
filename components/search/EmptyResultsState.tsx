/* Zero-results state for the listing rail — editorial, never a dead end. */
export default function EmptyResultsState({ cityName }: { cityName?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 12px" }}>
      <div
        className="font-mono"
        style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".24em", color: "#D9481F" }}
      >
        NOTHING ON THE LEDGER
      </div>
      <div
        className="font-serif"
        style={{ fontStyle: "italic", fontSize: 19, color: "rgba(29,25,19,.7)", marginTop: 10 }}
      >
        Nothing matches that combination{cityName ? ` in ${cityName}` : ""} — yet.
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "rgba(29,25,19,.55)" }}>
        Loosen a filter, or save the search and we&rsquo;ll watch the market for you.
      </p>
    </div>
  );
}
