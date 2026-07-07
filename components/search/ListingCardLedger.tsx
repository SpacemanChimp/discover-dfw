"use client";
import Link from "next/link";
import type { Listing } from "@/lib/mls/types";
import SaveListingButton from "./SaveListingButton";
import MLSAttribution from "./MLSAttribution";

import { badgeStyle, money } from "./format";

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
  const ppsf = listing.livingAreaSqft > 0 ? Math.round(listing.listPrice / listing.livingAreaSqft) : null;
  const photo = listing.media.find((m) => m.isPrimary)?.url ?? listing.media[0]?.url ?? null;
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
        <SaveListingButton listingKey={listing.listingKey} listPrice={listing.listPrice} standardStatus={listing.standardStatus} />
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
          {/* placeholder always renders underneath; a broken CDN URL just
              hides itself (onError) and the striped slot shows through */}
          <span
            className="font-mono"
            style={{ fontSize: 9.5, letterSpacing: ".2em", color: "rgba(29,25,19,.62)", padding: "0 14px", textAlign: "center" }}
          >
            MLS PHOTO — {listing.photoLabel.toUpperCase()}
          </span>
          {photo && (
            // plain <img>: the CDN already serves sized JPEGs, and next/image
            // optimization quota can't cover a 47k-listing inventory
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={`${listing.unparsedAddress}, ${cityName}`}
              loading="lazy"
              decoding="async"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
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
            {ppsf !== null && (
              <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".12em", color: "rgba(29,25,19,.62)" }}>
                ${ppsf} / SQFT
              </span>
            )}
          </div>
          <div style={{ fontSize: 15.5, fontWeight: 600, marginTop: 5 }}>{listing.unparsedAddress}</div>
          <div
            className="font-mono"
            style={{ fontSize: 9.5, letterSpacing: ".16em", color: "rgba(29,25,19,.62)", marginTop: 4 }}
          >
            {listing.neighborhood.toUpperCase()} ·{" "}
            <span style={{ color: "#C13E17", fontWeight: 700 }}>{cityName.toUpperCase()} ↗</span>
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
          <MLSAttribution
            attributionText={listing.attributionText}
            listingBrokerName={listing.listingBrokerName}
            listingId={listing.listingId}
            mlsSource={listing.mlsSource}
            compact
          />
        </div>
      </Link>
    </article>
  );
}
