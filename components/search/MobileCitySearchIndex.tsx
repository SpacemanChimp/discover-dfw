import Link from "next/link";
import { cities, countyById, fmtK } from "@/lib/dfw-data";

/* Mobile default: cities first, not the map. "Where to next?" index rows
   link into /city/[slug]/homes; the map stays a desktop affordance. */
export default function MobileCitySearchIndex({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const rows = cities
    .filter((c) => counts[c.slug])
    .sort(
      (a, b) => (counts[b.slug] || 0) - (counts[a.slug] || 0) || a.name.localeCompare(b.name)
    );

  return (
    <div className="mobile-only" style={{ padding: "18px 4vw 60px", width: "100%" }}>
      <div className="font-serif" style={{ fontStyle: "italic", fontWeight: 600, fontSize: 24 }}>
        Where to next?
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 18 }}>
        <span
          className="font-mono"
          style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".26em", color: "#D9481F" }}
        >
          THE INDEX — {rows.length} CITIES WITH HOMES
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
        {rows.map((c) => (
          <Link
            key={c.slug}
            href={`/city/${c.slug}/homes`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "13px 2px",
              borderBottom: "1px solid rgba(29,25,19,.16)",
              textDecoration: "none",
              color: "#1D1913",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="font-serif" style={{ fontWeight: 800, fontSize: 18 }}>
                {c.name}
              </div>
              <div
                className="font-mono"
                style={{ fontSize: 9, letterSpacing: ".14em", color: "rgba(29,25,19,.5)", marginTop: 2 }}
              >
                {countyById[c.county].name.toUpperCase()} CO · MEDIAN {fmtK(c.price)} · {c.dom} DOM
              </div>
            </div>
            <span
              className="font-mono"
              style={{
                background: (counts[c.slug] || 0) >= 2 ? "#D9481F" : "#FBF7EE",
                color: (counts[c.slug] || 0) >= 2 ? "#F6F1E6" : "#1D1913",
                border: "1.5px solid #1D1913",
                borderRadius: 999,
                fontSize: 9.5,
                fontWeight: 700,
                padding: "5px 10px",
                whiteSpace: "nowrap",
              }}
            >
              {counts[c.slug]} {counts[c.slug] === 1 ? "HOME" : "HOMES"}
            </span>
            <span style={{ fontSize: 16, color: "rgba(29,25,19,.5)" }}>›</span>
          </Link>
        ))}
      </div>
      <div
        className="font-mono"
        style={{
          textAlign: "center",
          fontSize: 9,
          letterSpacing: ".2em",
          color: "rgba(29,25,19,.45)",
          marginTop: 20,
        }}
      >
        MORE CITIES JOIN WITH THE LIVE MLS FEED
      </div>
    </div>
  );
}
