import Link from "next/link";
import { counties, citiesInCounty, fmtK, median } from "@/lib/dfw-data";

export default function CityIndex() {
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
                style={{ fontSize: 10.5, letterSpacing: ".14em", color: "#D9481F", fontWeight: 700 }}
              >
                MEDIAN {fmtK(median(cs.map((c) => c.price)))}
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
                  <span className="font-mono" style={{ fontSize: 11, color: "rgba(29,25,19,.6)" }}>
                    {fmtK(c.price)}
                  </span>
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
