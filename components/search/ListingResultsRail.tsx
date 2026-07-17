import { bySlug, type City } from "@/lib/dfw-data";
import { isLiveMls } from "@/lib/mls";
import type { ListingStatus, SearchResult } from "@/lib/mls/types";
import { resultScopeLabel } from "@/lib/mls/url";
import CitySearchHeader from "./CitySearchHeader";
import ListingCardLedger from "./ListingCardLedger";
import EmptyResultsState from "./EmptyResultsState";

/* The Map Room's left rail: city masthead (or the all-DFW header), Ledger
   cards, and the rail footnote. Server component — receives plain results. */
export default function ListingResultsRail({
  result,
  city,
  countyName,
  statuses,
  sourceNote,
}: {
  result: SearchResult;
  city?: City;
  countyName?: string;
  /** Active status filter — drives the honest result-total noun. */
  statuses?: ListingStatus[];
  /** Source-qualification shown when a school/district filter is active. */
  sourceNote?: string;
}) {
  const scope = resultScopeLabel(statuses);
  return (
    <>
      {city && countyName ? (
        <CitySearchHeader city={city} countyName={countyName} activeCount={result.total} scopeNoun={scope.noun} />
      ) : (
        <div
          className="font-mono"
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: ".24em",
            color: "#C13E17",
            borderBottom: "2px solid #1D1913",
            paddingBottom: 10,
          }}
        >
          ALL OF DFW — {result.total.toLocaleString("en-US")} {scope.noun}
          {scope.note && (
            <span style={{ display: "block", marginTop: 4, fontSize: 8.5, letterSpacing: ".14em", color: "rgba(29,25,19,.55)", fontWeight: 400 }}>
              {scope.note}
            </span>
          )}
        </div>
      )}
      {sourceNote && (
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 11,
            lineHeight: 1.55,
            color: "rgba(29,25,19,.62)",
            fontStyle: "italic",
          }}
        >
          {sourceNote}
        </p>
      )}
      {result.listings.map((l) => (
        <ListingCardLedger
          key={l.listingKey}
          listing={l}
          cityName={bySlug[l.citySlug]?.name || l.cityName}
        />
      ))}
      {result.total === 0 && <EmptyResultsState cityName={city?.name} />}
      <div
        className="font-mono"
        style={{
          textAlign: "center",
          fontSize: 10,
          letterSpacing: ".22em",
          color: "rgba(29,25,19,.62)",
          padding: "4px 0 2px",
        }}
      >
        {city
          ? `▾ ${result.total.toLocaleString("en-US")} IN ${city.name.toUpperCase()} · ${isLiveMls ? "NTREIS IDX" : "MOCK FEED"}`
          : isLiveMls
            ? `▾ ${result.total.toLocaleString("en-US")} ${scope.noun} ACROSS THE METROPLEX · NTREIS IDX`
            : "▾ MORE INVENTORY ARRIVES WITH THE LIVE FEED"}
      </div>
    </>
  );
}
