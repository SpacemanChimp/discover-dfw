import Link from "next/link";
import { cities } from "@/lib/dfw-data";
import { fmtPrice } from "@/lib/market/core";

/* Prices come from the canonical metric layer via the homepage (live NTREIS
   medians with editorial fallback decided INSIDE the layer). When the layer
   omits a city's median (e.g. zero active inventory), the city is skipped —
   never silently backfilled with a stale figure. */
export default function Ticker({ prices }: { prices?: Record<string, number> }) {
  const base = cities.flatMap((c) => {
    const v = prices ? prices[c.slug] : c.price;
    return v ? [{ t: c.name.toUpperCase(), p: fmtPrice(v), href: `/city/${c.slug}` }] : [];
  });
  const list = base.concat(base);
  return (
    <div
      style={{
        borderTop: "1px solid rgba(29,25,19,.25)",
        borderBottom: "1px solid rgba(29,25,19,.25)",
        overflow: "hidden",
        padding: "13px 0",
        background: "#F2EBDC",
      }}
    >
      {/* animation lives on .marquee in globals.css so :hover can pause it —
          an inline animation shorthand would pin play-state at inline
          specificity and the hover rule could never override it */}
      <div
        className="marquee"
        style={{
          display: "flex",
          gap: 38,
          width: "max-content",
        }}
      >
        {list.map((m, i) => (
          <Link
            key={i}
            href={m.href}
            className="ticker-item"
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 10,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            <span
              className="font-serif"
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: "#1D1913",
                letterSpacing: ".04em",
              }}
            >
              {m.t}
            </span>
            <span
              className="font-mono"
              style={{ fontSize: 12, color: "#D9481F", fontWeight: 700 }}
            >
              {m.p}
            </span>
            <span style={{ color: "rgba(29,25,19,.3)", fontSize: 13 }}>·</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
