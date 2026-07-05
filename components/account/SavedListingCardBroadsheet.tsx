"use client";
import Link from "next/link";
import type { Listing, SavedHome } from "@/lib/mls/types";
import { fmtK } from "@/lib/dfw-data";
import { money } from "@/components/search/format";
import { useShelf } from "@/lib/shelf";
import SaveListingButton from "@/components/search/SaveListingButton";

/* "The Broadsheet" — the shelf's horizontal ledger row. When the saved
   listing has left the feed (sold, withdrawn, or purged from mock data),
   it degrades to a NO LONGER AVAILABLE row instead of vanishing. */
export default function SavedListingCardBroadsheet({
  rec,
  listing,
}: {
  rec: SavedHome;
  listing: Listing | null;
}) {
  const shelf = useShelf();

  if (!listing) {
    const savedOn = new Date(rec.savedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return (
      <article
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          border: "2px dashed rgba(29,25,19,.35)",
          borderRadius: 14,
          background: "rgba(29,25,19,.03)",
          padding: "14px 16px",
          marginTop: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="font-mono"
            style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".18em", color: "rgba(29,25,19,.5)" }}
          >
            NO LONGER AVAILABLE
          </div>
          <div className="font-serif" style={{ fontStyle: "italic", fontSize: 15, color: "rgba(29,25,19,.6)", marginTop: 4 }}>
            This one left the market — saved {savedOn} at {money(rec.priceAtSave)}.
          </div>
        </div>
        <button
          type="button"
          onClick={() => shelf.toggleSave(rec.listingKey, rec.priceAtSave)}
          className="font-mono"
          style={{
            fontSize: 8.5,
            fontWeight: 700,
            letterSpacing: ".14em",
            color: "#D9481F",
            background: "none",
            border: "1.5px solid rgba(217,72,31,.5)",
            borderRadius: 999,
            padding: "8px 14px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          CLEAR
        </button>
      </article>
    );
  }

  const cut = listing.listPrice < rec.priceAtSave ? rec.priceAtSave - listing.listPrice : 0;

  return (
    <article
      style={{
        position: "relative",
        display: "flex",
        border: "2px solid #1D1913",
        borderRadius: 14,
        background: "#FBF7EE",
        overflow: "hidden",
        marginTop: 12,
      }}
    >
      <span style={{ position: "absolute", top: 10, right: 10, zIndex: 2 }}>
        <SaveListingButton listingKey={listing.listingKey} listPrice={listing.listPrice} size={30} />
      </span>
      <Link
        href={`/listing/${listing.listingKey}`}
        style={{ display: "flex", flex: 1, textDecoration: "none", color: "#1D1913", minWidth: 0 }}
      >
        <div
          style={{
            width: 112,
            flexShrink: 0,
            background: "repeating-linear-gradient(45deg,#EAE0C9 0 12px,#E2D6B9 12px 24px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            className="font-mono"
            style={{ fontSize: 7.5, letterSpacing: ".12em", color: "rgba(29,25,19,.5)", textAlign: "center" }}
          >
            MLS
            <br />
            PHOTO
          </span>
        </div>
        <div style={{ flex: 1, padding: "11px 13px", borderLeft: "2px solid #1D1913", minWidth: 0 }}>
          <span className="font-serif" style={{ fontWeight: 900, fontSize: 18, color: "#D9481F" }}>
            {money(listing.listPrice)}
          </span>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 2 }}>{listing.unparsedAddress}</div>
          <div
            className="font-mono"
            style={{ fontSize: 8, letterSpacing: ".1em", color: "rgba(29,25,19,.5)", marginTop: 3 }}
          >
            {listing.bedsTotal} BD · {listing.bathsTotal} BA · {listing.livingAreaSqft.toLocaleString("en-US")} SQFT
          </div>
          {cut > 0 && (
            <div
              className="font-mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#D9481F",
                color: "#F6F1E6",
                borderRadius: 99,
                fontSize: 7.5,
                fontWeight: 700,
                letterSpacing: ".1em",
                padding: "4px 9px",
                marginTop: 5,
              }}
            >
              ▾ PRICE CUT −{fmtK(cut)} SINCE YOU SAVED
            </div>
          )}
        </div>
      </Link>
    </article>
  );
}
