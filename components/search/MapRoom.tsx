import Link from "next/link";
import { bySlug, countyById, cities, fmtK } from "@/lib/dfw-data";
import { getListingProvider } from "@/lib/listings";
import type { SearchQuery } from "@/lib/listings/types";
import SearchNav from "./SearchNav";
import SearchToolbar from "./SearchToolbar";
import CitySearchHeader from "./CitySearchHeader";
import ListingCardLedger from "./ListingCardLedger";
import SearchMap from "./SearchMap";
import MLSComplianceFooter from "./MLSComplianceFooter";
import { allMockListings } from "@/lib/listings/mock-provider";

/* "The Map Room" — desktop: listing rail + city-aware map. Mobile: the
   index (cities first) until a city is chosen, then the rail full-width. */
export default async function MapRoom({
  query,
  citySlug,
}: {
  query: SearchQuery;
  /** Set when rendered from /city/[slug]/homes — city fixed by the path. */
  citySlug?: string;
}) {
  const provider = getListingProvider();
  const effective: SearchQuery = { ...query, citySlug: citySlug || query.citySlug };
  const [result, counts, totalResult] = await Promise.all([
    provider.search(effective),
    provider.cityCounts(),
    provider.search({}),
  ]);

  const city = effective.citySlug ? bySlug[effective.citySlug] : undefined;
  const county = city ? countyById[city.county] : undefined;
  const propertyTypes = Array.from(new Set(allMockListings.map((l) => l.propertyType))).sort();

  const indexRows = cities
    .filter((c) => counts[c.slug])
    .sort((a, b) => (counts[b.slug] || 0) - (counts[a.slug] || 0) || a.name.localeCompare(b.name));

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

      <div className="homes-split">
        {/* listing rail */}
        <div className={`homes-rail${!city ? " desktop-only-flex" : ""}`}>
          {city && county ? (
            <CitySearchHeader city={city} countyName={county.name} activeCount={result.total} />
          ) : (
            <div
              className="font-mono"
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".24em",
                color: "#D9481F",
                borderBottom: "2px solid #1D1913",
                paddingBottom: 10,
              }}
            >
              ALL OF DFW — {result.total} ACTIVE {result.total === 1 ? "HOME" : "HOMES"}
            </div>
          )}
          {result.listings.map((l) => (
            <ListingCardLedger key={l.listingKey} listing={l} cityName={bySlug[l.citySlug]?.name || l.citySlug} />
          ))}
          {result.total === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div className="font-serif" style={{ fontStyle: "italic", fontSize: 19, color: "rgba(29,25,19,.7)" }}>
                Nothing matches that combination — yet.
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "rgba(29,25,19,.55)" }}>
                Loosen a filter, or save the search and we&rsquo;ll watch for you.
              </p>
            </div>
          )}
          <div
            className="font-mono"
            style={{ textAlign: "center", fontSize: 10, letterSpacing: ".22em", color: "rgba(29,25,19,.45)", padding: "4px 0 2px" }}
          >
            {city
              ? `▾ ${result.total} IN ${city.name.toUpperCase()} · MOCK FEED`
              : "▾ MORE INVENTORY ARRIVES WITH THE LIVE FEED"}
          </div>
        </div>

        {/* the map (desktop) */}
        <div className="homes-map">
          <SearchMap listings={result.listings} activeCitySlug={effective.citySlug} total={totalResult.total} />
        </div>

        {/* mobile: the index — cities first */}
        {!city && (
          <div className="mobile-only" style={{ padding: "18px 4vw 60px", width: "100%" }}>
            <div className="font-serif" style={{ fontStyle: "italic", fontWeight: 600, fontSize: 24 }}>
              Where to next?
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 18 }}>
              <span className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".26em", color: "#D9481F" }}>
                THE INDEX — {indexRows.length} CITIES WITH HOMES
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
              {indexRows.map((c) => (
                <Link
                  key={c.slug}
                  href={`/city/${c.slug}/homes`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 2px",
                    borderBottom: "1px solid rgba(29,25,19,.16)",
                    textDecoration: "none",
                    color: "#1D1913",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="font-serif" style={{ fontWeight: 800, fontSize: 18 }}>
                      {c.name}
                    </div>
                    <div className="font-mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "rgba(29,25,19,.5)", marginTop: 2 }}>
                      {countyById[c.county].name.toUpperCase()} CO · MEDIAN {fmtK(c.price)} · {c.dom} DOM
                    </div>
                  </div>
                  <span
                    className="font-mono"
                    style={{
                      background: (counts[c.slug] || 0) >= 2 ? "#D9481F" : "#FBF7EE",
                      color: (counts[c.slug] || 0) >= 2 ? "#F6F1E6" : "#1D1913",
                      border: "1.5px solid #1D1913",
                      borderRadius: 999,
                      fontSize: 9.5,
                      fontWeight: 700,
                      padding: "5px 10px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {counts[c.slug]} {counts[c.slug] === 1 ? "HOME" : "HOMES"}
                  </span>
                  <span style={{ fontSize: 16, color: "rgba(29,25,19,.5)" }}>›</span>
                </Link>
              ))}
            </div>
            <div
              className="font-mono"
              style={{ textAlign: "center", fontSize: 9, letterSpacing: ".2em", color: "rgba(29,25,19,.45)", marginTop: 20 }}
            >
              MORE CITIES JOIN WITH THE LIVE MLS FEED
            </div>
          </div>
        )}
      </div>

      <MLSComplianceFooter asOf={result.asOf} />
    </div>
  );
}
