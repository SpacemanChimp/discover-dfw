"use client";
import { useState } from "react";
import Link from "next/link";
import type { Listing } from "@/lib/listings/types";
import { fmtK, type City } from "@/lib/dfw-data";
import SaveListingButton from "./SaveListingButton";
import MLSAttribution from "./MLSAttribution";
import RequestShowingSheet from "./RequestShowingSheet";
import AskQuestionSheet from "./AskQuestionSheet";
import { badgeStyle, money } from "./ListingCardLedger";

/* "The Dossier" — editorial listing detail: hero photo band, serif price,
   know-the-city median bar, ledger stats, and the two lead CTAs. */
export default function ListingDetailDossier({
  listing,
  city,
  countyName,
}: {
  listing: Listing;
  city: City;
  countyName: string;
}) {
  const [sheet, setSheet] = useState<"showing" | "question" | null>(null);
  const b = badgeStyle(listing);
  const ppsf = Math.round(listing.listPrice / listing.livingAreaSqft);
  const ratio = listing.listPrice / city.price;
  const barW = Math.max(18, Math.min(92, Math.round(50 * ratio)));
  const deltaPct = Math.round((ratio - 1) * 100);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 4vw 120px" }}>
      {/* hero photo band */}
      <div
        style={{
          position: "relative",
          height: "clamp(260px, 42vw, 420px)",
          background: "repeating-linear-gradient(45deg,#EAE0C9 0 12px,#E2D6B9 12px 24px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "2px solid #1D1913",
          borderRadius: 20,
          marginTop: 22,
          overflow: "hidden",
        }}
      >
        <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".2em", color: "rgba(29,25,19,.5)" }}>
          MLS PHOTO 1 OF {listing.photoCount} — {listing.photoLabel.toUpperCase()}
        </span>
        <span style={{ position: "absolute", top: 14, right: 14 }}>
          <SaveListingButton listingKey={listing.listingKey} listPrice={listing.listPrice} size={40} />
        </span>
        <span
          className="font-mono"
          style={{
            position: "absolute",
            bottom: 12,
            right: 12,
            background: "#1D1913",
            color: "#F6F1E6",
            fontSize: 8.5,
            letterSpacing: ".14em",
            borderRadius: 99,
            padding: "5px 10px",
          }}
        >
          ◧ {listing.photoCount} PHOTOS
        </span>
      </div>

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
          <span className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".16em", color: "rgba(29,25,19,.5)" }}>
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
          {listing.unparsedAddress}, {city.name}, TX
        </div>
        <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".14em", color: "rgba(29,25,19,.5)", marginTop: 6 }}>
          {listing.bedsTotal} BD · {listing.bathsTotal} BA · {listing.livingAreaSqft.toLocaleString("en-US")} SQFT ·
          BUILT {listing.yearBuilt} · ${ppsf}/SQFT
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
      </div>

      {/* ledger stats */}
      <div className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".26em", color: "#D9481F", marginTop: 26 }}>
        01 — THE NUMBERS
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 10 }}>
        {[
          ["DAYS ON MARKET", String(listing.daysOnMarket), undefined],
          ["$ / SQFT", `$${ppsf}`, "#D9481F"],
          ["PROPERTY TYPE", listing.propertyType, undefined],
          ["YEAR BUILT", String(listing.yearBuilt), undefined],
        ].map(([k, v, color]) => (
          <div
            key={k}
            style={{ border: "1.5px solid rgba(29,25,19,.35)", borderRadius: 12, background: "#FBF7EE", padding: "12px 15px" }}
          >
            <div className="font-mono" style={{ fontSize: 7.5, letterSpacing: ".18em", color: "rgba(29,25,19,.5)" }}>
              {k}
            </div>
            <div className="font-serif" style={{ fontWeight: 800, fontSize: 20, marginTop: 2, color: color || "#1D1913" }}>
              {v}
            </div>
          </div>
        ))}
      </div>

      {/* know the city */}
      <div className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".26em", color: "#D9481F", marginTop: 26 }}>
        02 — KNOW THE CITY
      </div>
      <div style={{ border: "2px solid #1D1913", borderRadius: 14, background: "#F2EBDC", padding: "16px 18px", marginTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span className="font-serif" style={{ fontWeight: 800, fontSize: 20 }}>
            {city.name}
          </span>
          <Link
            href={`/city/${city.slug}`}
            className="font-mono"
            style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".14em", color: "#D9481F", textDecoration: "none" }}
          >
            FULL CITY REPORT →
          </Link>
        </div>
        <div className="font-mono" style={{ marginTop: 12, fontSize: 8.5, letterSpacing: ".12em", color: "rgba(29,25,19,.55)" }}>
          THIS HOME VS CITY MEDIAN ({fmtK(city.price)} · PLACEHOLDER)
        </div>
        <div style={{ position: "relative", height: 8, borderRadius: 99, background: "rgba(29,25,19,.14)", marginTop: 8 }}>
          <span
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${barW}%`, borderRadius: 99, background: "#1D1913" }}
          />
          <span style={{ position: "absolute", left: "50%", top: -3, width: 3, height: 14, background: "#D9481F", borderRadius: 2 }} />
        </div>
        <div
          className="font-mono"
          style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 6, fontSize: 8, letterSpacing: ".1em", color: "rgba(29,25,19,.5)", flexWrap: "wrap" }}
        >
          <span>
            {deltaPct >= 0 ? "+" : ""}
            {deltaPct}% VS MEDIAN
          </span>
          <span>
            {city.isd.toUpperCase()} · {countyName.toUpperCase()} COUNTY · {city.commute[0]} MIN TO DT DALLAS
          </span>
        </div>
        {listing.neighborhood && (
          <div className="font-mono" style={{ marginTop: 10, fontSize: 8.5, letterSpacing: ".12em" }}>
            <Link href={`/city/${city.slug}`} style={{ color: "rgba(29,25,19,.55)", textDecoration: "none" }}>
              MORE IN {city.name.toUpperCase()} →
            </Link>
          </div>
        )}
      </div>

      <div style={{ marginTop: 22 }}>
        <MLSAttribution courtesyOf={listing.courtesyOf} listingKey={listing.listingKey} />
      </div>

      {/* CTAs — sticky on small screens */}
      <div
        className="dossier-ctas"
        style={{
          display: "flex",
          gap: 10,
          padding: "14px 0 0",
          marginTop: 18,
        }}
      >
        <button
          type="button"
          onClick={() => setSheet("showing")}
          className="btn-primary"
          style={{
            flex: 1.4,
            background: "#D9481F",
            color: "#F6F1E6",
            borderRadius: 999,
            padding: "15px 0",
            textAlign: "center",
            fontWeight: 700,
            fontSize: 14,
            border: "2px solid #D9481F",
            boxShadow: "0 10px 22px rgba(217,72,31,.28)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Request a showing
        </button>
        <button
          type="button"
          onClick={() => setSheet("question")}
          style={{
            flex: 1,
            border: "2px solid #1D1913",
            borderRadius: 999,
            padding: "15px 0",
            textAlign: "center",
            fontWeight: 700,
            fontSize: 14,
            background: "#F6F1E6",
            color: "#1D1913",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Ask a question
        </button>
      </div>

      <RequestShowingSheet
        listing={listing}
        cityName={city.name}
        open={sheet === "showing"}
        onClose={() => setSheet(null)}
      />
      <AskQuestionSheet
        listing={listing}
        cityName={city.name}
        open={sheet === "question"}
        onClose={() => setSheet(null)}
      />
    </div>
  );
}
