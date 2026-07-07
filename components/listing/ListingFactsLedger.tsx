import type { Listing } from "@/lib/mls/types";

/* "01 — THE NUMBERS" — the dossier's facts grid, straight off the feed. */
export default function ListingFactsLedger({ listing }: { listing: Listing }) {
  const ppsf = Math.round(listing.listPrice / listing.livingAreaSqft);
  const listed = new Date(listing.listDate + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const facts: { label: string; value: string; color?: string }[] = [
    { label: "DAYS ON MARKET", value: String(listing.daysOnMarket) },
    { label: "$ / SQFT", value: `$${ppsf}`, color: "#D9481F" },
    { label: "PROPERTY TYPE", value: listing.propertyType },
    { label: "YEAR BUILT", value: String(listing.yearBuilt) },
    { label: "STATUS", value: listing.standardStatus.replace(/([A-Z])/g, " $1").trim() },
    { label: "LISTED", value: listed.toUpperCase() },
  ];
  if (listing.lotSizeAcres) facts.push({ label: "LOT", value: `${listing.lotSizeAcres} AC` });
  const oh = listing.openHouses?.[0];
  if (oh)
    facts.push({
      label: "OPEN HOUSE",
      value: `${new Date(oh.date + "T12:00:00Z")
        .toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
        .toUpperCase()} ${oh.window}`,
      color: "#D9481F",
    });
  if (listing.originalListPrice && listing.originalListPrice > listing.listPrice)
    facts.push({
      label: "ORIGINAL PRICE",
      value: `$${Math.round(listing.originalListPrice / 1000)}K`,
    });

  return (
    <>
      <div
        className="font-mono"
        style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".26em", color: "#C13E17", marginTop: 26 }}
      >
        01 — THE NUMBERS
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
          gap: 10,
          marginTop: 10,
        }}
      >
        {facts.map((f) => (
          <div
            key={f.label}
            style={{ border: "1.5px solid rgba(29,25,19,.35)", borderRadius: 12, background: "#FBF7EE", padding: "12px 15px" }}
          >
            <div className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".18em", color: "rgba(29,25,19,.62)" }}>
              {f.label}
            </div>
            <div
              className="font-serif"
              style={{ fontWeight: 800, fontSize: 20, marginTop: 2, color: f.color || "#1D1913", whiteSpace: "nowrap" }}
            >
              {f.value}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
