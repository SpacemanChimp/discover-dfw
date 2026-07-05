import { bySlug, countyById, cities } from "@/lib/dfw-data";
import { getMlsProvider } from "@/lib/mls";
import type { SearchFilters } from "@/lib/mls/types";
import SearchNav from "./SearchNav";
import SearchToolbar from "./SearchToolbar";
import ListingResultsRail from "./ListingResultsRail";
import SearchMapPanel from "./SearchMapPanel";
import MobileCitySearchIndex from "./MobileCitySearchIndex";
import MLSComplianceFooter from "./MLSComplianceFooter";

/* "The Map Room" — desktop: listing rail + city-aware map panel. Mobile:
   the index (cities first) until a city is chosen, then the rail
   full-width. Composed from ListingResultsRail / SearchMapPanel /
   MobileCitySearchIndex; this component owns data fetching + layout. */
export default async function MapRoom({
  query,
  citySlug,
}: {
  query: SearchFilters;
  /** Set when rendered from /city/[slug]/homes — city fixed by the path. */
  citySlug?: string;
}) {
  const provider = getMlsProvider();
  const effective: SearchFilters = { ...query, citySlug: citySlug || query.citySlug };
  const [result, totalResult] = await Promise.all([
    provider.searchListings(effective),
    // unfiltered page for map context, index counts, and the type filter list
    provider.searchListings({ pageSize: 500 }),
  ]);

  const counts: Record<string, number> = {};
  for (const l of totalResult.listings) counts[l.citySlug] = (counts[l.citySlug] || 0) + 1;

  const city = effective.citySlug ? bySlug[effective.citySlug] : undefined;
  const county = city ? countyById[city.county] : undefined;
  const propertyTypes = Array.from(new Set(totalResult.listings.map((l) => l.propertyType))).sort();

  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      <SearchNav />
      <div
        className="font-mono"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          padding: "8px 4vw",
          borderBottom: "1px solid rgba(29,25,19,.16)",
          fontSize: 9.5,
          letterSpacing: ".22em",
          color: "rgba(29,25,19,.55)",
        }}
      >
        <span>A FIELD GUIDE TO NORTH TEXAS REAL ESTATE</span>
        <span style={{ display: "flex", gap: 16 }}>
          <span>{cities.length} CITIES</span>
          <span style={{ color: "#D9481F" }}>✳</span>
          <span>LIVE MLS FEED — PLACEHOLDER</span>
        </span>
      </div>

      <SearchToolbar query={effective} citySlug={citySlug} propertyTypes={propertyTypes} />

      {/* mock-data notice — stays until the live feed is approved and wired */}
      <div
        className="font-mono"
        role="note"
        style={{
          textAlign: "center",
          padding: "9px 4vw",
          background: "rgba(217,72,31,.08)",
          borderBottom: "1.5px dashed rgba(217,72,31,.5)",
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: ".2em",
          color: "#D9481F",
        }}
      >
        SAMPLE INVENTORY — EVERY LISTING IS FICTIONAL UNTIL MLS APPROVAL &amp; THE LIVE IDX FEED
      </div>

      <div className="homes-split">
        <div className={`homes-rail${!city ? " desktop-only-flex" : ""}`}>
          <ListingResultsRail result={result} city={city} countyName={county?.name} />
        </div>

        <div className="homes-map">
          <SearchMapPanel
            listings={result.listings}
            activeCitySlug={effective.citySlug}
            total={totalResult.total}
          />
        </div>

        {!city && <MobileCitySearchIndex counts={counts} />}
      </div>

      <MLSComplianceFooter asOf={result.mlsLastUpdated} />
    </div>
  );
}
