import Link from "next/link";
import { cities, fmtK } from "@/lib/dfw-data";

export default function Ticker() {
  const base = cities.map((c) => ({
    t: c.name.toUpperCase(),
    p: fmtK(c.price),
    href: `/city/${c.slug}`,
  }));
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
      <div
        className="marquee"
        style={{
          display: "flex",
          gap: 38,
          width: "max-content",
          animation: "marqueeMove 60s linear infinite",
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
