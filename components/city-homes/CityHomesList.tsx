import type { Listing } from "@/lib/mls/types";
import ListingCardLedger from "@/components/search/ListingCardLedger";
import MLSAttribution from "@/components/search/MLSAttribution";
import CityHomesEmptyState, { type NearbyCityCount } from "./CityHomesEmptyState";

/* The city's inventory as a Ledger-card grid, with the group-level IDX
   attribution slot beneath, per display rules. */
export default function CityHomesList({
  listings,
  cityName,
  countyName,
  mlsSource,
  nearby,
}: {
  listings: Listing[];
  cityName: string;
  countyName: string;
  mlsSource: string;
  nearby: NearbyCityCount[];
}) {
  return (
    <section style={{ maxWidth: 1280, margin: "0 auto", padding: "26px 4vw 70px" }}>
      <div
        className="font-mono"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          borderBottom: "2px solid #1D1913",
          paddingBottom: 10,
          marginBottom: 20,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: ".24em",
          color: "#D9481F",
        }}
      >
        <span>
          ON THE MARKET — {listings.length} {listings.length === 1 ? "HOME" : "HOMES"}
        </span>
        <span style={{ color: "rgba(29,25,19,.45)", fontWeight: 400 }}>NEWEST FIRST · MOCK FEED</span>
      </div>

      {listings.length === 0 ? (
        <CityHomesEmptyState cityName={cityName} countyName={countyName} nearby={nearby} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(min(320px,100%),1fr))",
            gap: 18,
            alignItems: "start",
          }}
        >
          {listings.map((l) => (
            <ListingCardLedger key={l.listingKey} listing={l} cityName={cityName} />
          ))}
        </div>
      )}

      {/* group-level attribution reservation below the listing group */}
      <div style={{ borderTop: "1px solid rgba(29,25,19,.16)", marginTop: 26, paddingTop: 12 }}>
        <MLSAttribution
          attributionText={null}
          listingBrokerName={null}
          mlsSource={mlsSource}
        />
      </div>
    </section>
  );
}
