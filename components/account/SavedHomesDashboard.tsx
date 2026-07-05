"use client";
import Link from "next/link";
import type { Listing } from "@/lib/mls/types";
import { bySlug, fmtK } from "@/lib/dfw-data";
import { useShelf } from "@/lib/shelf";
import { money } from "@/components/search/ListingCardLedger";
import SaveListingButton from "@/components/search/SaveListingButton";

/* "Your shelf." — saved homes grouped by city, with price-cut-since-you-saved
   badges. Phase 1 receives the full mock inventory and filters client-side;
   Phase 2 fetches saved keys from the provider. */
export default function SavedHomesDashboard({ allListings }: { allListings: Listing[] }) {
  const shelf = useShelf();
  const saved = shelf.ready
    ? allListings.filter((l) => shelf.isSaved(l.listingKey))
    : [];

  const groups: { citySlug: string; items: Listing[] }[] = [];
  for (const l of saved) {
    const g = groups.find((x) => x.citySlug === l.citySlug);
    if (g) g.items.push(l);
    else groups.push({ citySlug: l.citySlug, items: [l] });
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "26px 4vw 100px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 className="font-serif" style={{ margin: 0, fontWeight: 900, fontSize: "clamp(30px,5vw,40px)" }}>
          Your shelf.
        </h1>
        <span className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".16em", color: "rgba(29,25,19,.5)" }}>
          {shelf.account ? `SYNCED ✓ · ${shelf.account.email.toUpperCase()}` : "GUEST SHELF"}
        </span>
      </div>

      {/* tabs pill */}
      <div style={{ display: "flex", border: "2px solid #1D1913", borderRadius: 999, marginTop: 16, overflow: "hidden" }}>
        <span
          className="font-mono"
          style={{ flex: 1, textAlign: "center", padding: "12px 0", fontSize: 9.5, fontWeight: 700, letterSpacing: ".14em", background: "#1D1913", color: "#F6F1E6" }}
        >
          {saved.length} {saved.length === 1 ? "HOME" : "HOMES"}
        </span>
        <Link
          href="/account/saved-searches"
          className="font-mono"
          style={{ flex: 1, textAlign: "center", padding: "12px 0", fontSize: 9.5, letterSpacing: ".14em", color: "#1D1913", textDecoration: "none" }}
        >
          {shelf.searches.length} {shelf.searches.length === 1 ? "SEARCH" : "SEARCHES"}
        </Link>
      </div>

      {/* guest banner */}
      {shelf.ready && !shelf.account && saved.length > 0 && (
        <div
          style={{
            margin: "14px 0 0",
            border: "2px dashed rgba(217,72,31,.6)",
            borderRadius: 12,
            padding: "11px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(217,72,31,.06)",
          }}
        >
          <span style={{ fontSize: 13 }}>⚑</span>
          <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.45, color: "rgba(29,25,19,.75)" }}>
            Guest shelf — lives on this device only.
          </span>
          <button
            type="button"
            onClick={shelf.openAuth}
            className="font-mono"
            style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".12em", color: "#D9481F", background: "none", border: "none", cursor: "pointer" }}
          >
            CREATE ACCOUNT →
          </button>
        </div>
      )}

      {shelf.ready && saved.length === 0 ? (
        <div style={{ textAlign: "center", padding: "70px 0 40px" }}>
          <div className="font-serif" style={{ fontStyle: "italic", fontWeight: 600, fontSize: 22, color: "rgba(29,25,19,.7)" }}>
            Nothing on the shelf yet.
          </div>
          <p style={{ margin: "10px auto 0", maxWidth: 340, fontSize: 14, lineHeight: 1.6, color: "rgba(29,25,19,.6)" }}>
            Tap the ♡ on any home and it lands here — price cuts and status changes included.
          </p>
          <Link
            href="/homes"
            className="btn-primary"
            style={{
              display: "inline-block",
              marginTop: 20,
              background: "#D9481F",
              color: "#F6F1E6",
              borderRadius: 999,
              padding: "14px 28px",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
              border: "2px solid #D9481F",
            }}
          >
            Browse homes
          </Link>
        </div>
      ) : (
        groups.map((g) => {
          const c = bySlug[g.citySlug];
          return (
            <section key={g.citySlug} style={{ marginTop: 24 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 10,
                  borderBottom: "2px solid #1D1913",
                  paddingBottom: 7,
                }}
              >
                <span className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".2em", color: "#D9481F" }}>
                  {(c?.name || g.citySlug).toUpperCase()} — {g.items.length} {g.items.length === 1 ? "HOME" : "HOMES"}
                </span>
                {c && (
                  <Link
                    href={`/city/${c.slug}`}
                    className="font-mono"
                    style={{ fontSize: 8.5, letterSpacing: ".12em", color: "rgba(29,25,19,.5)", textDecoration: "none" }}
                  >
                    CITY MEDIAN {fmtK(c.price)} · REPORT →
                  </Link>
                )}
              </div>
              {g.items.map((l) => {
                const rec = shelf.saved[l.listingKey];
                const cut = rec && l.listPrice < rec.priceAtSave ? rec.priceAtSave - l.listPrice : 0;
                return (
                  <article
                    key={l.listingKey}
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
                      <SaveListingButton listingKey={l.listingKey} listPrice={l.listPrice} size={30} />
                    </span>
                    <Link
                      href={`/listing/${l.listingKey}`}
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
                        <span className="font-mono" style={{ fontSize: 7.5, letterSpacing: ".12em", color: "rgba(29,25,19,.5)", textAlign: "center" }}>
                          MLS
                          <br />
                          PHOTO
                        </span>
                      </div>
                      <div style={{ flex: 1, padding: "11px 13px", borderLeft: "2px solid #1D1913", minWidth: 0 }}>
                        <span className="font-serif" style={{ fontWeight: 900, fontSize: 18, color: "#D9481F" }}>
                          {money(l.listPrice)}
                        </span>
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 2 }}>{l.unparsedAddress}</div>
                        <div className="font-mono" style={{ fontSize: 8, letterSpacing: ".1em", color: "rgba(29,25,19,.5)", marginTop: 3 }}>
                          {l.bedsTotal} BD · {l.bathsTotal} BA · {l.livingAreaSqft.toLocaleString("en-US")} SQFT
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
                            ▾ PRICE CUT −{fmtK(cut).replace("$", "$")} SINCE YOU SAVED
                          </div>
                        )}
                      </div>
                    </Link>
                  </article>
                );
              })}
            </section>
          );
        })
      )}

      {saved.length >= 2 && (
        <div
          className="font-mono"
          style={{
            border: "2px dashed rgba(29,25,19,.35)",
            borderRadius: 999,
            padding: "12px 0",
            textAlign: "center",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: ".16em",
            color: "rgba(29,25,19,.5)",
            marginTop: 20,
          }}
        >
          ⇄ COMPARE VIEW — COMING IN PHASE 2
        </div>
      )}
    </div>
  );
}
