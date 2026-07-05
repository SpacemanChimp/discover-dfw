import { bySlug, type City } from "@/lib/dfw-data";
import type { SearchResult } from "@/lib/mls/types";
import CitySearchHeader from "./CitySearchHeader";
import ListingCardLedger from "./ListingCardLedger";
import EmptyResultsState from "./EmptyResultsState";

/* The Map Room's left rail: city masthead (or the all-DFW header), Ledger
   cards, and the rail footnote. Server component — receives plain results. */
export default function ListingResultsRail({
  result,
  city,
  countyName,
}: {
  result: SearchResult;
  city?: City;
  countyName?: string;
}) {
  return (
    <>
      {city && countyName ? (
        <CitySearchHeader city={city} countyName={countyName} activeCount={result.total} />
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
          color: "rgba(29,25,19,.45)",
          padding: "4px 0 2px",
        }}
      >
        {city
          ? `▾ ${result.total} IN ${city.name.toUpperCase()} · MOCK FEED`
          : "▾ MORE INVENTORY ARRIVES WITH THE LIVE FEED"}
      </div>
    </>
  );
}
