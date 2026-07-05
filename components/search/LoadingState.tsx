/* Search-surface loading skeleton — striped card slots in the rail rhythm. */
export default function LoadingState({ cards = 3 }: { cards?: number }) {
  return (
    <div
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "26px 4vw 80px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
      aria-busy="true"
      aria-label="Loading listings"
    >
      <div
        className="font-mono"
        style={{
          textAlign: "center",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: ".26em",
          color: "#D9481F",
          padding: "8px 0 2px",
        }}
      >
        PULLING THE LEDGER…
      </div>
      {Array.from({ length: cards }, (_, i) => (
        <div
          key={i}
          style={{
            border: "2px solid rgba(29,25,19,.25)",
            borderRadius: 18,
            overflow: "hidden",
            background: "#FBF7EE",
          }}
        >
          <div
            style={{
              height: 180,
              background: "repeating-linear-gradient(45deg,#EFE7D6 0 12px,#E7DDC7 12px 24px)",
            }}
          />
          <div style={{ padding: "16px 18px" }}>
            <div style={{ height: 22, width: "42%", borderRadius: 6, background: "rgba(29,25,19,.1)" }} />
            <div style={{ height: 13, width: "68%", borderRadius: 6, background: "rgba(29,25,19,.08)", marginTop: 10 }} />
            <div style={{ height: 13, width: "55%", borderRadius: 6, background: "rgba(29,25,19,.08)", marginTop: 7 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
