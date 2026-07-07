import Link from "next/link";
import type { City } from "@/lib/dfw-data";
import { fmtK } from "@/lib/dfw-data";
import type { Listing } from "@/lib/mls/types";
import { isLiveMls } from "@/lib/mls";

/* "02 — KNOW THE CITY" — ties the listing back to the editorial city
   report with the this-home-vs-city-median bar. */
export default function ListingCityContext({
  listing,
  city,
  countyName,
}: {
  listing: Listing;
  city: City;
  countyName: string;
}) {
  const ratio = listing.listPrice / city.price;
  const barW = Math.max(18, Math.min(92, Math.round(50 * ratio)));
  const deltaPct = Math.round((ratio - 1) * 100);

  return (
    <>
      <div
        className="font-mono"
        style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".26em", color: "#C13E17", marginTop: 26 }}
      >
        02 — KNOW THE CITY
      </div>
      <div style={{ border: "2px solid #1D1913", borderRadius: 14, background: "#F2EBDC", padding: "16px 18px", marginTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span className="font-serif" style={{ fontWeight: 800, fontSize: 20 }}>
            {city.name}
          </span>
          <Link
            href={`/city/${city.slug}`}
            className="link-underline font-mono"
            style={{
              fontSize: 8.5,
              fontWeight: 700,
              letterSpacing: ".14em",
              color: "#C13E17",
              textDecoration: "none",
              display: "inline-block",
              padding: "10px 0",
            }}
          >
            FULL CITY REPORT →
          </Link>
        </div>
        <div className="font-mono" style={{ marginTop: 12, fontSize: 8.5, letterSpacing: ".12em", color: "rgba(29,25,19,.62)" }}>
          THIS HOME VS CITY MEDIAN ({fmtK(city.price)} · {isLiveMls ? "EDITORIAL EST." : "PLACEHOLDER"})
        </div>
        <div style={{ position: "relative", height: 8, borderRadius: 99, background: "rgba(29,25,19,.14)", marginTop: 8 }}>
          <span
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${barW}%`, borderRadius: 99, background: "#1D1913" }}
          />
          <span style={{ position: "absolute", left: "50%", top: -3, width: 3, height: 14, background: "#D9481F", borderRadius: 2 }} />
        </div>
        <div
          className="font-mono"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            marginTop: 6,
            fontSize: 8,
            letterSpacing: ".1em",
            color: "rgba(29,25,19,.62)",
            flexWrap: "wrap",
          }}
        >
          <span>
            {deltaPct >= 0 ? "+" : ""}
            {deltaPct}% VS MEDIAN
          </span>
          <span>
            {city.isd.toUpperCase()} · {countyName.toUpperCase()} COUNTY · {city.commute[0]} MIN TO DT DALLAS
          </span>
        </div>
        <div className="font-mono" style={{ marginTop: 10, fontSize: 8.5, letterSpacing: ".12em" }}>
          <Link
            href={`/city/${city.slug}/homes`}
            className="link-underline"
            style={{ color: "#C13E17", textDecoration: "none", display: "inline-block", padding: "10px 0" }}
          >
            ALL {city.name.toUpperCase()} HOMES →
          </Link>
        </div>
      </div>
    </>
  );
}
