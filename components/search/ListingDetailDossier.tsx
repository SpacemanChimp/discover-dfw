import type { Listing, ListingSchools } from "@/lib/mls/types";
import type { City } from "@/lib/dfw-data";
import { DISCLAIMER_RESERVED } from "@/lib/compliance";
import { badgeStyle, money } from "./format";
import MLSAttribution from "./MLSAttribution";
import LastUpdatedStamp from "@/components/compliance/LastUpdatedStamp";
import ListingPhotoGallery from "@/components/listing/ListingPhotoGallery";
import ListingFactsLedger from "@/components/listing/ListingFactsLedger";
import ListingCityContext from "@/components/listing/ListingCityContext";
import ListingSchoolsCard from "@/components/listing/ListingSchoolsCard";
import ListingLeadCTA from "@/components/listing/ListingLeadCTA";

/* "The Dossier" — editorial listing detail: gallery hero, serif price,
   facts ledger, know-the-city module, compliance reservations, and the
   lead CTAs (sticky bar on mobile). Server component; interactivity lives
   in the gallery heart and the CTA island. */
export default function ListingDetailDossier({
  listing,
  city,
  countyName,
  schools = null,
  liveMls = false,
}: {
  listing: Listing;
  city: City;
  countyName: string;
  /** MLS-reported schools (listing record or live supplement) — null hides/notes. */
  schools?: ListingSchools | null;
  liveMls?: boolean;
}) {
  const b = badgeStyle(listing);
  const ppsf = listing.livingAreaSqft > 0 ? Math.round(listing.listPrice / listing.livingAreaSqft) : null;

  return (
    // wide shell so the gallery can breathe; text stays at a readable measure below
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 4vw 60px" }}>
      <ListingPhotoGallery listing={listing} />

      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        {/* headline block */}
        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span
              className="font-mono"
              style={{
                background: b.bg,
                color: b.fg,
                border: `1.5px solid ${b.border}`,
                fontSize: 8.5,
                fontWeight: 700,
                letterSpacing: ".14em",
                borderRadius: 99,
                padding: "5px 10px",
              }}
            >
              {b.label}
            </span>
            <span className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".16em", color: "rgba(29,25,19,.62)" }}>
              {listing.propertyType.toUpperCase()} · {listing.neighborhood.toUpperCase()}
            </span>
          </div>
          <h1
            className="font-serif"
            style={{ margin: "10px 0 0", fontWeight: 900, fontSize: "clamp(34px,5vw,48px)", color: "#D9481F", lineHeight: 1 }}
          >
            {money(listing.listPrice)}
          </h1>
          <div style={{ fontSize: 17, fontWeight: 600, marginTop: 6 }}>
            {listing.unparsedAddress}, {city.name}, TX{listing.postalCode ? ` ${listing.postalCode}` : ""}
          </div>
          <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".14em", color: "rgba(29,25,19,.62)", marginTop: 6 }}>
            {listing.bedsTotal} BD · {listing.bathsTotal} BA · {listing.livingAreaSqft.toLocaleString("en-US")} SQFT
            {listing.yearBuilt ? ` · BUILT ${listing.yearBuilt}` : ""}{ppsf !== null ? ` · $${ppsf}/SQFT` : ""}
          </div>
          <p
            className="font-serif"
            style={{
              margin: "16px 0 0",
              fontStyle: "italic",
              fontSize: 16,
              lineHeight: 1.65,
              color: "rgba(29,25,19,.78)",
              borderTop: "1px solid rgba(29,25,19,.16)",
              paddingTop: 14,
            }}
          >
            {listing.editorialNote}
          </p>
          {listing.publicRemarks && (
            <p style={{ margin: "12px 0 0", fontSize: 14.5, lineHeight: 1.75, color: "rgba(29,25,19,.75)" }}>
              {listing.publicRemarks}
            </p>
          )}
        </div>

        <ListingFactsLedger listing={listing} />
        <ListingCityContext listing={listing} city={city} countyName={countyName} />
        <ListingSchoolsCard schools={schools} live={liveMls} />

        {/* compliance reservations: attribution, source, last updated, disclaimer */}
        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 6 }}>
          <MLSAttribution
            attributionText={listing.attributionText}
            listingBrokerName={listing.listingBrokerName}
            listingId={listing.listingId}
            mlsSource={listing.mlsSource}
          />
          <div className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".14em", color: "rgba(29,25,19,.62)" }}>
            <LastUpdatedStamp asOf={listing.mlsLastUpdated} prefix="LAST UPDATED" />
            {" · "}
            {(listing.disclaimerText ?? DISCLAIMER_RESERVED).toUpperCase()}
          </div>
        </div>

        <ListingLeadCTA listing={listing} cityName={city.name} />
      </div>
    </div>
  );
}
