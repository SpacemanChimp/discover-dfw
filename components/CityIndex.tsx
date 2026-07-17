import Link from "next/link";
import { counties, citiesInCounty } from "@/lib/dfw-data";
import { fmtPrice, medianOf } from "@/lib/market/core";

/* Prices come from the canonical metric layer via the homepage. The county
   header figure is a MEDIAN OF CITY MEDIANS (labeled as such) — we do not
   compute metro/county-wide listing medians client-side. */
export default function CityIndex({
  prices,
  pricesLive,
  pricesAsOf,
}: {
  prices?: Record<string, number>;
  pricesLive?: boolean;
  pricesAsOf?: string;
}) {
  // when a prices map is supplied, it is the whole truth: a missing entry
  // means the canonical layer omitted the metric — render nothing for it
  const priceOf = (slug: string, fallback: number): number | undefined =>
    prices ? prices[slug] : fallback;
  return (
    <section id="cities" style={{ maxWidth: 1380, margin: "0 auto", padding: "96px 4vw 60px" }}>
      <div data-reveal="1" style={{ marginBottom: 44 }}>
        <div
          className="font-mono"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".32em",
            color: "#D9481F",
            marginBottom: 14,
          }}
        >
          03 — THE INDEX
        </div>
        <h2
          className="font-serif"
          style={{
            margin: 0,
            fontWeight: 800,
            fontSize: "clamp(34px,4.2vw,56px)",
            lineHeight: 1.02,
          }}
        >
          Every city, county by county.
        </h2>
        <div
          className="font-mono"
          style={{ marginTop: 12, fontSize: 9.5, letterSpacing: ".18em", color: "rgba(29,25,19,.5)" }}
        >
          {pricesLive
            ? "CITY FIGURES: MEDIAN ACTIVE LIST PRICE · SOURCE: NTREIS"
            : "CITY FIGURES: EDITORIAL MEDIANS, SEEDED FROM NTREIS SNAPSHOTS"}
        </div>
      </div>

      {counties.map((co) => {
        const cs = citiesInCounty(co.id)
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name));
        return (
          <div id={`idx-${co.id}`} data-reveal="1" key={co.id} style={{ marginBottom: 42 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 16,
                borderBottom: "2px solid #1D1913",
                paddingBottom: 10,
                marginBottom: 6,
              }}
            >
              <span
                className="font-serif"
                style={{ fontStyle: "italic", fontWeight: 700, fontSize: 26 }}
              >
                {co.name} County
              </span>
              <span
                className="font-mono"
                style={{ fontSize: 10.5, letterSpacing: ".18em", color: "rgba(29,25,19,.5)" }}
              >
                {cs.length} CITIES
              </span>
              <span style={{ flex: 1 }} />
              <span
                className="font-mono"
                title="Median of this county's city medians — not a county-wide listing median"
                style={{ fontSize: 10.5, letterSpacing: ".14em", color: "#D9481F", fontWeight: 700 }}
              >
                {(() => {
                  const v = medianOf(
                    cs.map((c) => priceOf(c.slug, c.price)).filter((x): x is number => typeof x === "number" && x > 0)
                  );
                  return v ? `MEDIAN CITY LIST ${fmtPrice(v)}` : "";
                })()}
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(235px,1fr))",
                gap: "0 30px",
              }}
            >
              {cs.map((c) => (
                <Link
                  key={c.slug}
                  href={`/city/${c.slug}`}
                  className="index-row"
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                    padding: "11px 8px",
                    margin: "0 -8px",
                    textDecoration: "none",
                    color: "#1D1913",
                    borderBottom: "1px solid rgba(29,25,19,.14)",
                    borderRadius: 8,
                  }}
                >
                  <span className="font-serif" style={{ fontWeight: 700, fontSize: 16.5 }}>
                    {c.name}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      borderBottom: "1px dotted rgba(29,25,19,.28)",
                      transform: "translateY(-4px)",
                    }}
                  />
                  {(() => {
                    const v = priceOf(c.slug, c.price);
                    return v ? (
                      <span className="font-mono" style={{ fontSize: 11, color: "rgba(29,25,19,.6)" }}>
                        {fmtPrice(v)}
                      </span>
                    ) : null;
                  })()}
                  <span style={{ fontSize: 13, color: "inherit" }}>→</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
