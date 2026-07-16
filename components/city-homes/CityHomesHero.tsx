import Link from "next/link";
import type { CityMarketSnapshot } from "@/lib/mls/types";

/* City homes hero — the field-guide masthead for a city's inventory, with
   the road back to the editorial city report and over to the map room.
   The chip shows the SEARCH-RESULT total under the current filters (the
   default search spans Active + other on-market statuses) — it is NOT the
   canonical Active count, which the mini snapshot below carries with full
   provenance. Never label this count "active". */
export default function CityHomesHero({
  snapshot,
  total,
  scopeNote,
}: {
  snapshot: CityMarketSnapshot;
  /** listings matching the current search filters */
  total: number;
  /** what the total covers when no status filter is applied */
  scopeNote?: string;
}) {
  return (
    <header style={{ maxWidth: 1280, margin: "0 auto", padding: "42px 4vw 10px" }}>
      <div
        className="font-mono"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          fontSize: 10.5,
          letterSpacing: ".24em",
          color: "#C13E17",
          border: "1.5px solid rgba(217,72,31,.5)",
          borderRadius: 999,
          padding: "7px 14px",
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 99, background: "#D9481F", display: "inline-block" }} />
        {snapshot.countyName.toUpperCase()} COUNTY · HOMES FOR SALE
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div>
          <h1
            className="font-serif"
            style={{
              margin: "12px 0 0",
              fontWeight: 900,
              fontSize: "clamp(40px,6vw,76px)",
              lineHeight: 0.98,
              letterSpacing: "-.015em",
            }}
          >
            Homes in {snapshot.cityName}.
          </h1>
          <p
            className="font-serif"
            style={{
              margin: "12px 0 0",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "clamp(17px,2.2vw,23px)",
              color: "rgba(29,25,19,.75)",
            }}
          >
            {snapshot.tagline}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, alignItems: "flex-end", paddingBottom: 6 }}>
          <span
            className="font-mono"
            style={{
              background: "#C13E17",
              color: "#F6F1E6",
              borderRadius: 999,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: ".14em",
              padding: "8px 16px",
            }}
          >
            {total.toLocaleString("en-US")} MATCHING {total === 1 ? "LISTING" : "LISTINGS"}
          </span>
          {scopeNote && (
            <span
              className="font-mono"
              style={{ fontSize: 8.5, letterSpacing: ".16em", color: "rgba(29,25,19,.55)" }}
            >
              {scopeNote}
            </span>
          )}
          <Link
            href={`/city/${snapshot.citySlug}`}
            className="link-underline font-mono"
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "#C13E17", textDecoration: "none" }}
          >
            READ THE FULL CITY REPORT →
          </Link>
          <Link
            href={`/homes?city=${snapshot.citySlug}`}
            className="link-underline font-mono"
            style={{ fontSize: 10, letterSpacing: ".18em", color: "#C13E17", textDecoration: "none" }}
          >
            OPEN THE MAP ROOM ↗
          </Link>
        </div>
      </div>
    </header>
  );
}
