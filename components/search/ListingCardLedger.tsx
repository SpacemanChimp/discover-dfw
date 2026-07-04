"use client";
import Link from "next/link";
import type { Listing } from "@/lib/listings/types";
import SaveListingButton from "./SaveListingButton";
import MLSAttribution from "./MLSAttribution";

export function badgeStyle(l: Listing): { label: string; bg: string; fg: string; border: string } {
  if (l.badge === "NEW")
    return { label: `NEW — ${l.daysOnMarket} DAYS`, bg: "#D9481F", fg: "#F6F1E6", border: "#D9481F" };
  if (l.badge.startsWith("OPEN"))
    return { label: l.badge, bg: "#FBF7EE", fg: "#1D1913", border: "#1D1913" };
  if (l.badge === "PRICE CUT")
    return { label: "PRICE CUT", bg: "#1D1913", fg: "#F6F1E6", border: "#1D1913" };
  return { label: `${l.daysOnMarket} DAYS`, bg: "#FBF7EE", fg: "#1D1913", border: "#1D1913" };
}

export const money = (n: number) => "$" + n.toLocaleString("en-US");

/* "The Ledger" — the default listing card: serif price, mono ledger row,
   one editorial line, reserved attribution. */
export default function ListingCardLedger({
  listing,
  cityName,
}: {
  listing: Listing;
  cityName: string;
}) {
  const b = badgeStyle(listing);
  const ppsf = Math.round(listing.listPrice / listing.livingAreaSqft);
  return (
    <article
      className="listing-card"
      style={{
        position: "relative",
        border: "2px solid #1D1913",
        borderRadius: 18,
        background: "#FBF7EE",
        overflow: "hidden",
      }}
    >
      {/* heart lives outside the card link — a button inside an anchor is
          invalid HTML and breaks hydration */}
      <span style={{ position: "absolute", top: 10, right: 12, zIndex: 2 }}>
        <SaveListingButton listingKey={listing.listingKey} listPrice={listing.listPrice} />
      </span>
      <Link
        href={`/listing/${listing.listingKey}`}
        style={{ textDecoration: "none", color: "#1D1913", display: "block" }}
      >
        <div
          style={{
            position: "relative",
            height: 210,
            background: "repeating-linear-gradient(45deg,#EAE0C9 0 12px,#E2D6B9 12px 24px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            className="font-mono"
            style={{ fontSize: 9.5, letterSpacing: ".2em", color: "rgba(29,25,19,.5)" }}
          >
            MLS PHOTO — {listing.photoLabel.toUpperCase()}
          </span>
          <span
            className="font-mono"
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              background: b.bg,
              color: b.fg,
              border: `1.5px solid ${b.border}`,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: ".18em",
              borderRadius: 999,
              padding: "6px 11px",
            }}
          >
            {b.label}
          </span>
        </div>
        <div style={{ padding: "16px 18px 6px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <span className="font-serif" style={{ fontWeight: 900, fontSize: 27, color: "#D9481F" }}>
              {money(listing.listPrice)}
            </span>
            <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".12em", color: "rgba(29,25,19,.55)" }}>
              ${ppsf} / SQFT
            </span>
          </div>
          <div style={{ fontSize: 15.5, fontWeight: 600, marginTop: 5 }}>{listing.unparsedAddress}</div>
          <div
            className="font-mono"
            style={{ fontSize: 9.5, letterSpacing: ".16em", color: "rgba(29,25,19,.5)", marginTop: 4 }}
          >
            {listing.neighborhood.toUpperCase()} ·{" "}
            <span style={{ color: "#D9481F", fontWeight: 700 }}>{cityName.toUpperCase()} ↗</span>
          </div>
        </div>
        <div
          className="font-mono"
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "12px 18px",
            borderTop: "1px solid rgba(29,25,19,.16)",
            marginTop: 12,
            fontSize: 10,
            letterSpacing: ".06em",
          }}
        >
          <span><b className="font-serif" style={{ fontSize: 15 }}>{listing.bedsTotal}</b> BD</span>
          <span><b className="font-serif" style={{ fontSize: 15 }}>{listing.bathsTotal}</b> BA</span>
          <span><b className="font-serif" style={{ fontSize: 15 }}>{listing.livingAreaSqft.toLocaleString("en-US")}</b> SQFT</span>
          <span><b className="font-serif" style={{ fontSize: 15 }}>{listing.yearBuilt}</b> BUILT</span>
        </div>
        <div
          className="font-serif"
          style={{
            padding: "11px 18px 12px",
            borderTop: "1px solid rgba(29,25,19,.16)",
            fontStyle: "italic",
            fontSize: 13.5,
            lineHeight: 1.5,
            color: "rgba(29,25,19,.72)",
          }}
        >
          {listing.editorialNote}
        </div>
        <div style={{ padding: "0 18px 14px" }}>
          <MLSAttribution courtesyOf={listing.courtesyOf} listingKey={listing.listingKey} compact />
        </div>
      </Link>
    </article>
  );
}
