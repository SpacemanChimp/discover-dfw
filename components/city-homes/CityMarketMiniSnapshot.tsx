import type { CityMarketMetricSet } from "@/lib/market/core";
import { fmtMetricValue, provenanceLabel } from "@/lib/market/core";

/* Compact market band under the city homes hero — displays the CANONICAL
   metric set (lib/market), the same values the city report and homepage
   show. Metrics the layer omits simply don't render (never zero-filled).
   YoY appears only once the snapshot history can genuinely back it.
   On-market status counts only — sold stats are NOT published. */
export default function CityMarketMiniSnapshot({
  set,
  statusCounts,
  isd,
}: {
  set: CityMarketMetricSet | null;
  statusCounts?: { Pending?: number; ActiveUnderContract?: number };
  isd: string;
}) {
  const m = set?.metrics;
  const stats: { label: string; value: string; color?: string }[] = [
    ...(m?.median_active_list_price
      ? [{ label: "MEDIAN LIST", value: fmtMetricValue(m.median_active_list_price), color: "#D9481F" }]
      : []),
    ...(m?.median_price_per_sqft ? [{ label: "$ / SQFT", value: fmtMetricValue(m.median_price_per_sqft) }] : []),
    ...(m?.median_days_on_market ? [{ label: "DAYS ON MKT", value: fmtMetricValue(m.median_days_on_market) }] : []),
    ...(m?.active_listing_count ? [{ label: "ACTIVE", value: fmtMetricValue(m.active_listing_count) }] : []),
    ...(statusCounts
      ? [{ label: "PENDING / UNDER K", value: `${statusCounts.Pending ?? 0} / ${statusCounts.ActiveUnderContract ?? 0}` }]
      : []),
    ...(m?.yoy_median_list_price_change
      ? [{ label: "YOY MEDIAN", value: fmtMetricValue(m.yoy_median_list_price_change) }]
      : []),
    { label: "SCHOOLS", value: isd },
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
            <div className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".2em", color: "rgba(29,25,19,.62)" }}>
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
        {set && (
          <div
            className="font-mono"
            style={{
              alignSelf: "center",
              fontSize: 9,
              letterSpacing: ".16em",
              color: "#C13E17",
              border: set.sourceType === "mls_replica" ? "1px solid rgba(217,72,31,.6)" : "1px dashed rgba(217,72,31,.6)",
              borderRadius: 999,
              padding: "7px 13px",
            }}
          >
            {provenanceLabel(set)}
          </div>
        )}
      </div>
    </section>
  );
}
