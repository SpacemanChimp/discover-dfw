import { cities } from "@/lib/dfw-data";

export default function About({ copyOverride, regionKey }: { copyOverride?: React.ReactNode; regionKey?: string } = {}) {
  const n = cities.length;
  return (
    <section
      id="about"
      style={{ borderTop: "2px solid #1D1913", background: "#F2EBDC" }}
    >
      <div
        style={{
          maxWidth: 1380,
          margin: "0 auto",
          padding: "96px 4vw",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
          gap: 56,
        }}
      >
        <div data-reveal="1">
          <div
            className="font-mono"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".32em",
              color: "#D9481F",
              marginBottom: 18,
            }}
          >
            04 — WHY DISCOVER DFW
          </div>
          <p
            className="font-serif"
            style={{
              margin: 0,
              fontStyle: "italic",
              fontWeight: 600,
              fontSize: "clamp(26px,3vw,38px)",
              lineHeight: 1.32,
            }}
          >
            “We walk the blocks, drive the commutes, and read the tax rates so
            your shortlist is actually short.”
          </p>
        </div>
        <div
          data-reveal="1"
          style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 26 }}
        >
          {copyOverride ? (
            <div data-bb-region={regionKey} style={{ fontSize: 16, lineHeight: 1.75, color: "rgba(29,25,19,.8)" }}>{copyOverride}</div>
          ) : (
            <p data-bb-region={regionKey} style={{ margin: 0, fontSize: 16, lineHeight: 1.75, color: "rgba(29,25,19,.8)" }}>
              The metroplex adds a small city&apos;s worth of people every year, and
              every one of them asks the same question: <em>where, exactly?</em>{" "}
              Discover DFW is the answer machine — {n} city reports behind one map,
              written like a local explains it over coffee, with the numbers to
              back it up.
            </p>
          )}
          <div>
            {[
              ["RELOCATING", "Compare schools, commutes, and vibe before the house-hunting trip."],
              ["LOCAL", "Moving up, sizing down, or crossing the county line — see what your money does elsewhere."],
              ["INVESTING", `Growth corridors, days-on-market, and price-per-foot across all ${n} markets.`],
            ].map(([tag, body], i, arr) => (
              <div
                key={tag}
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "baseline",
                  padding: "13px 0",
                  borderTop: "1px solid rgba(29,25,19,.25)",
                  borderBottom: i === arr.length - 1 ? "1px solid rgba(29,25,19,.25)" : undefined,
                }}
              >
                <span
                  className="font-mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: ".2em",
                    color: "#D9481F",
                    fontWeight: 700,
                    minWidth: 96,
                  }}
                >
                  {tag}
                </span>
                <span style={{ fontSize: 14.5, color: "rgba(29,25,19,.8)" }}>{body}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
