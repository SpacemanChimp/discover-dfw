import type { CityMarketSnapshot } from "@/lib/mls/types";
import { fmtK } from "@/lib/dfw-data";
import { isLiveMls } from "@/lib/mls";

/* Compact market band under the city homes hero. Live mode: median/psf/DOM
   computed from the replicated store (YoY stays an editorial estimate —
   no year-old baseline yet). Mock mode keeps the placeholder chip. */
export default function CityMarketMiniSnapshot({ snapshot }: { snapshot: CityMarketSnapshot }) {
  const stats: { label: string; value: string; color?: string }[] = [
    { label: "MEDIAN LIST", value: fmtK(snapshot.medianListPrice), color: "#D9481F" },
    { label: "$ / SQFT", value: `$${snapshot.pricePerSqft}` },
    { label: "DAYS ON MKT", value: String(snapshot.medianDaysOnMarket) },
    { label: "YOY (EST.)", value: snapshot.yoyChange },
    { label: "SCHOOLS", value: snapshot.isd },
  ];
  return (
    <section style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 4vw 8px" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              border: "1.5px solid rgba(29,25,19,.35)",
              borderRadius: 14,
              padding: "11px 16px",
              background: "#FBF7EE",
              minWidth: 110,
            }}
          >
            <div className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".2em", color: "rgba(29,25,19,.5)" }}>
              {s.label}
            </div>
            <div
              className="font-serif"
              style={{ fontWeight: 800, fontSize: 19, color: s.color || "#1D1913", marginTop: 3, whiteSpace: "nowrap" }}
            >
              {s.value}
            </div>
          </div>
        ))}
        <div
          className="font-mono"
          style={{
            alignSelf: "center",
            fontSize: 9,
            letterSpacing: ".16em",
            color: "#D9481F",
            border: isLiveMls ? "1px solid rgba(217,72,31,.6)" : "1px dashed rgba(217,72,31,.6)",
            borderRadius: 999,
            padding: "7px 13px",
          }}
        >
          {isLiveMls
            ? "LIVE NTREIS MARKET DATA · YOY IS AN EDITORIAL ESTIMATE"
            : "PLACEHOLDER FIGURES — SWAP FOR LIVE MARKET DATA"}
        </div>
      </div>
    </section>
  );
}
