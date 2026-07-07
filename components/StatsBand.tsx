import { cities, counties } from "@/lib/dfw-data";
import { isLiveMls } from "@/lib/mls";

/* The band's figures stay editorial even on the live feed (metro-wide
   median isn't computed yet) — live mode must not call them placeholders
   while the footer declares live NTREIS data, but must not claim live
   either. */
const estNote = isLiveMls ? "EDITORIAL ESTIMATE" : "PLACEHOLDER";
const STATS: [string, string][] = [
  ["$528K", `METRO MEDIAN LIST · ${estNote}`],
  [String(cities.length), "CITIES PROFILED IN FULL"],
  [String(counties.length), "COUNTIES ON THE MAP"],
  ["8.4M", `METRO RESIDENTS · ${estNote}`],
];

export default function StatsBand() {
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
