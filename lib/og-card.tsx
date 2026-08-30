/* Shared Open Graph card — the field-guide look in a 1200×630 frame.
   Deterministic and dependency-free (system fonts, brand colors, no
   remote fetches) so social images build fast and never flake. Listing
   pages intentionally use the branded default rather than MLS photos:
   IDX licensing for off-platform social embeds is not established, so no
   MLS photograph ever appears in a social card. */

export const OG_SIZE = { width: 1200, height: 630 };

export function OgCard({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#F6F1E6",
        color: "#1D1913",
        padding: "64px 72px",
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            fontSize: 26,
            fontFamily: "ui-monospace, Menlo, monospace",
            letterSpacing: "0.22em",
            color: "#C13E17",
            fontWeight: 700,
          }}
        >
          {kicker.toUpperCase()}
        </div>
        <div
          style={{
            fontSize: title.length > 34 ? 68 : 84,
            fontWeight: 800,
            lineHeight: 1.04,
            marginTop: 26,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 30, marginTop: 24, color: "rgba(29,25,19,0.72)", maxWidth: 940, lineHeight: 1.35 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: "3px solid #1D1913",
          paddingTop: 26,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 800 }}>
          DISC
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: "50% 50% 50% 0",
              background: "#D9481F",
              transform: "rotate(-45deg)",
              margin: "0 6px",
            }}
          />
          VER DFW
        </div>
        <div
          style={{
            fontSize: 20,
            fontFamily: "ui-monospace, Menlo, monospace",
            letterSpacing: "0.18em",
            color: "rgba(29,25,19,0.6)",
          }}
        >
          A FIELD GUIDE TO NORTH TEXAS REAL ESTATE
        </div>
      </div>
    </div>
  );
}
