import Link from "next/link";

/* Popular home searches — full-width editorial navigation right after the
   hero. An unframed ledger grid in the field-guide voice: thin ink rules,
   compact orange numbering, serif names, a small arrow. Reads as an index
   in a book, not a filter bar: no pills, no cards, no carousel, no
   horizontal scrolling. Grid: 4×2 on wide desktop, 2 columns on phones,
   1 column only under ~340px (globals.css .pop-search-*). */

const SEARCHES: ReadonlyArray<[label: string, href: string]> = [
  ["Pool homes", "/homes/with-pool"],
  ["Homes on acreage", "/homes/on-acreage"],
  ["3+ car garage homes", "/homes/3-car-garage"],
  ["Single-story homes", "/homes/single-story"],
  ["5+ bedroom homes", "/homes/5-plus-bedrooms"],
  ["Open houses", "/homes/open-houses"],
  ["Land", "/land"],
  ["New builds", "/new-builds"],
];

export default function PopularSearches() {
  return (
    <section
      id="popular-searches"
      aria-label="Popular home searches"
      style={{
        background: "#F6F1E6",
        color: "#1D1913",
        padding: "clamp(46px, 7vw, 84px) 4vw clamp(40px, 6vw, 72px)",
        borderTop: "1px solid rgba(29,25,19,.14)",
      }}
    >
      <div style={{ maxWidth: 1380, margin: "0 auto" }}>
        <div
          className="font-mono"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".26em", color: "#C13E17" }}
        >
          POPULAR HOME SEARCHES
        </div>
        <h2
          className="font-serif"
          style={{
            margin: "10px 0 0",
            fontWeight: 900,
            fontSize: "clamp(26px, 3.4vw, 44px)",
            lineHeight: 1.06,
            letterSpacing: "-0.01em",
          }}
        >
          Find the home that fits your life.
        </h2>
        <p
          style={{
            margin: "12px 0 0",
            fontSize: 14.5,
            lineHeight: 1.6,
            color: "rgba(29,25,19,.66)",
            maxWidth: 560,
          }}
        >
          Eight live searches built on real MLS fields, refreshed from the NTREIS feed all day.
        </p>

        <ul className="pop-search-grid" style={{ listStyle: "none", margin: "30px 0 0", padding: 0 }}>
          {SEARCHES.map(([label, href], i) => (
            <li key={href}>
              <Link href={href} className="pop-search-link">
                <span className="pop-search-num font-mono" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="pop-search-name font-serif">{label}</span>
                <span className="pop-search-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
