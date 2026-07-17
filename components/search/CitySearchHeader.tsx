import Link from "next/link";
import { fmtK, type City } from "@/lib/dfw-data";

/* Dark city masthead card at the top of the listing rail — ties MLS search
   back to the editorial city report. */
export default function CitySearchHeader({
  city,
  countyName,
  activeCount,
  scopeNoun = "MATCHING LISTINGS",
}: {
  city: City;
  countyName: string;
  activeCount: number;
  /** Honest scope word for the count (default search ≠ "active"). */
  scopeNoun?: string;
}) {
  return (
    <div
      style={{
        border: "2px solid #1D1913",
        borderRadius: 18,
        background: "#1D1913",
        color: "#F6F1E6",
        padding: "20px 22px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".24em", color: "#E88D6B" }}>
          {countyName.toUpperCase()} COUNTY · CITY REPORT
        </div>
        <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".18em", color: "rgba(246,241,230,.6)" }}>
          {activeCount.toLocaleString("en-US")} {scopeNoun.replace(/ LISTINGS$/, "")}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
        <span className="font-serif" style={{ fontWeight: 900, fontSize: 34 }}>
          {city.name}
        </span>
        <span className="font-serif" style={{ fontStyle: "italic", fontSize: 15, color: "rgba(246,241,230,.8)" }}>
          {city.tagline}
        </span>
      </div>
      <div
        className="font-mono"
        style={{
          display: "flex",
          gap: 22,
          flexWrap: "wrap",
          marginTop: 14,
          paddingTop: 14,
          borderTop: "1px solid rgba(246,241,230,.2)",
          fontSize: 10.5,
          letterSpacing: ".08em",
        }}
      >
        <span>
          MEDIAN <b style={{ color: "#E88D6B" }}>{fmtK(city.price)}</b>
        </span>
        <span>
          $/SQFT <b>${city.ppsf}</b>
        </span>
        <span>
          DOM <b>{city.dom}</b>
        </span>
        <Link
          href={`/city/${city.slug}`}
          style={{ marginLeft: "auto", color: "#E88D6B", fontWeight: 700, textDecoration: "none" }}
        >
          READ THE CITY REPORT →
        </Link>
      </div>
    </div>
  );
}
