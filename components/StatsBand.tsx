import { cities, counties, fmtPop } from "@/lib/dfw-data";
import { fmtPrice, fmtAsOf, medianOf } from "@/lib/market/core";

/* Every figure here is derived, never hardcoded: the price is the MEDIAN OF
   the 90 CITY MEDIANS from the canonical metric layer (labeled as exactly
   that — it is not a metro-wide listing median), and residents is the sum of
   the profiled cities' Census populations (not the full metro total). */
export default function StatsBand({
  prices,
  pricesLive,
  pricesAsOf,
}: {
  prices?: Record<string, number>;
  pricesLive?: boolean;
  pricesAsOf?: string;
}) {
  // prices map (when supplied) is the whole truth — cities the canonical
  // layer omitted are excluded from the aggregate, never backfilled
  const cityMedians = cities
    .map((c) => (prices ? prices[c.slug] : c.price))
    .filter((v): v is number => typeof v === "number" && v > 0);
  const medianOfMedians = medianOf(cityMedians);
  const residents = cities.reduce((sum, c) => sum + c.pop, 0);
  const priceNote =
    pricesLive && pricesAsOf
      ? `MEDIAN OF CITY MEDIANS · ${fmtAsOf(pricesAsOf)} · NTREIS`
      : "MEDIAN OF CITY MEDIANS · EDITORIAL";
  const STATS: [string, string][] = [
    ...(medianOfMedians ? ([[fmtPrice(medianOfMedians), priceNote]] as [string, string][]) : []),
    [String(cities.length), "CITIES PROFILED IN FULL"],
    [String(counties.length), "COUNTIES ON THE MAP"],
    [fmtPop(residents), "RESIDENTS IN PROFILED CITIES · CENSUS 2024"],
  ];
  return (
    <section style={{ background: "#1D1913", color: "#F6F1E6" }}>
      <div
        style={{
          maxWidth: 1380,
          margin: "0 auto",
          padding: "72px 4vw",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: 36,
        }}
      >
        {STATS.map(([big, label]) => (
          <div data-reveal="1" key={label}>
            <div style={{ width: 34, height: 4, background: "#D9481F", marginBottom: 18 }} />
            <div
              className="font-serif"
              style={{
                fontWeight: 900,
                fontSize: "clamp(40px,4.4vw,58px)",
                lineHeight: 1,
              }}
            >
              {big}
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: 10.5,
                letterSpacing: ".2em",
                color: "rgba(246,241,230,.6)",
                marginTop: 10,
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
