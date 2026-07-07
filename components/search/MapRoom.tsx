import { bySlug, countyById, cities } from "@/lib/dfw-data";
import { getMlsProvider, isLiveMls, PROPERTY_TYPE_OPTIONS } from "@/lib/mls";
import type { SearchFilters } from "@/lib/mls/types";
import { searchFiltersToQueryString } from "@/lib/mls/url";
import SearchNav from "./SearchNav";
import SearchToolbar from "./SearchToolbar";
import Pager from "./Pager";
import ListingResultsRail from "./ListingResultsRail";
import SearchMapPanel from "./SearchMapPanel";
import LiveMapPanel from "./LiveMapPanel";
import MobileCitySearchIndex from "./MobileCitySearchIndex";
import MLSComplianceFooter from "./MLSComplianceFooter";

/* "The Map Room" — desktop: listing rail + city-aware map panel. Mobile:
   the index (cities first) until a city is chosen, then the rail
   full-width. Composed from ListingResultsRail / SearchMapPanel /
   MobileCitySearchIndex; this component owns data fetching + layout. */
export default async function MapRoom({
  query,
  citySlug,
  authFailed,
}: {
  query: SearchFilters;
  /** Set when rendered from /city/[slug]/homes — city fixed by the path. */
  citySlug?: string;
  /** True when /auth/callback bounced here after a failed link exchange. */
  authFailed?: boolean;
}) {
  const provider = getMlsProvider();
  const effective: SearchFilters = { ...query, citySlug: citySlug || query.citySlug };
  const [result, counts] = await Promise.all([
    provider.searchListings(effective),
    // per-city active counts for map context + the mobile index
    provider.getActiveCountsByCity(),
  ]);
  const metroTotal = Object.values(counts).reduce((a, b) => a + b, 0);

  const city = effective.citySlug ? bySlug[effective.citySlug] : undefined;
  const county = city ? countyById[city.county] : undefined;
  const propertyTypes = PROPERTY_TYPE_OPTIONS;

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
          <span>{isLiveMls ? "LIVE MLS FEED — NTREIS" : "LIVE MLS FEED — PLACEHOLDER"}</span>
        </span>
      </div>

      <SearchToolbar query={effective} citySlug={citySlug} propertyTypes={propertyTypes} />

      {authFailed && (
        <div
          className="font-mono"
          role="alert"
          style={{
            textAlign: "center",
            padding: "10px 4vw",
            background: "#1D1913",
            color: "#E88D6B",
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: ".18em",
          }}
        >
          THAT SIGN-IN LINK DIDN&rsquo;T TAKE — LINKS ARE ONE-USE AND MUST OPEN IN THE SAME BROWSER
          THAT REQUESTED THEM. HIT SIGN IN (TOP RIGHT) FOR A FRESH ONE.
        </div>
      )}

      {/* mock-data notice — only when the live feed isn't wired */}
      {!isLiveMls && (
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
      )}

      <div className="homes-split">
        <div className={`homes-rail${!city ? " desktop-only-flex" : ""}`}>
          <ListingResultsRail result={result} city={city} countyName={county?.name} />
          <Pager
            total={result.total}
            page={result.page}
            pageSize={result.pageSize}
            basePath={citySlug ? `/city/${citySlug}/homes` : "/homes"}
            qs={searchFiltersToQueryString(effective, !!citySlug)}
          />
        </div>

        <div className="homes-map">
          {isLiveMls ? (
            // real geographic map with price pins over the whole filtered
            // result set (search surfaces only — the illustrated metroplex
            // stays everywhere editorial)
            <LiveMapPanel
              qs={searchFiltersToQueryString(effective)}
              activeCitySlug={effective.citySlug}
              total={result.total}
            />
          ) : (
            <SearchMapPanel
              listings={result.listings}
              activeCitySlug={effective.citySlug}
              total={metroTotal}
            />
          )}
        </div>

        {!city && <MobileCitySearchIndex counts={counts} />}
      </div>

      <MLSComplianceFooter asOf={result.mlsLastUpdated} />
    </div>
  );
}
