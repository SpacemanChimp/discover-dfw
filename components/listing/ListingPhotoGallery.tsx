"use client";
import { useCallback, useEffect, useState } from "react";
import type { Listing } from "@/lib/mls/types";
import SaveListingButton from "@/components/search/SaveListingButton";

/* Gallery collage — Zillow-class: hero spanning two rows (~60% width) plus a
   2x2 grid of side tiles on wide containers; full-width 4:3 hero with a
   two-tile strip on narrow screens. Every photo and chip opens the lightbox:
   full-bleed viewer over all replicated photos with arrow/keyboard navigation
   and a counter. Slots fall back to the striped caption placeholder when the
   feed supplies no URL (mock mode). */

/* Responsive layout lives in a scoped style block (precedent: MAP_CSS in
   components/search/LiveMapPanel.tsx) — queried against the wrapper's
   container width, not the viewport, so it holds inside any shell. The
   ddfw-gallery-nX classes collapse the grid when there are fewer than five
   photos so no slot renders as an empty black box. */
const GALLERY_CSS = `
.ddfw-gallery-wrap { container-type: inline-size; }
.ddfw-gallery-collage {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
}
.ddfw-gallery-slot { display: flex; align-items: center; justify-content: center; }
.ddfw-gallery-hero { grid-column: 1 / -1; aspect-ratio: 4 / 3; }
.ddfw-gallery-tile { aspect-ratio: 16 / 10; }
.ddfw-gallery-tile-3, .ddfw-gallery-tile-4 { display: none; }
.ddfw-gallery-n1 .ddfw-gallery-tile-1 { grid-column: 1 / -1; aspect-ratio: 21 / 9; }
@container (min-width: 1000px) {
  .ddfw-gallery-collage {
    height: clamp(380px, 46vw, 640px);
    grid-template-columns: 3fr 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }
  .ddfw-gallery-hero, .ddfw-gallery-tile, .ddfw-gallery-n1 .ddfw-gallery-tile-1 { aspect-ratio: auto; }
  .ddfw-gallery-tile-3, .ddfw-gallery-tile-4 { display: flex; }
  .ddfw-gallery-hero { grid-column: 1; grid-row: 1 / 3; }
  .ddfw-gallery-n0 .ddfw-gallery-hero { grid-column: 1 / -1; }
  .ddfw-gallery-n1 { grid-template-columns: 3fr 2fr; grid-template-rows: 1fr; }
  .ddfw-gallery-n1 .ddfw-gallery-hero { grid-row: 1; }
  .ddfw-gallery-n1 .ddfw-gallery-tile-1 { grid-column: 2; }
  .ddfw-gallery-n2 { grid-template-columns: 3fr 2fr; }
  .ddfw-gallery-n3 .ddfw-gallery-tile-3 { grid-column: 2 / 4; }
  .ddfw-gallery-more-sm { display: none; }
}
`;

export default function ListingPhotoGallery({ listing }: { listing: Listing }) {
  const photos = listing.media.filter((m) => m.url);
  const [primary, ...rest] = listing.media;
  const side = rest.slice(0, 4);
  // mobile shows two side tiles, desktop up to four — each layout's +N chip
  // counts only what that layout hides
  const mobileVisible = Math.min(side.length, 2);
  const remaining = Math.max(0, photos.length - 1 - side.length);
  const remainingSm = Math.max(0, photos.length - 1 - mobileVisible);
  const [open, setOpen] = useState<number | null>(null);
  const [broken, setBroken] = useState<ReadonlySet<number>>(new Set());
  const markBroken = (i: number) => setBroken((prev) => new Set(prev).add(i));

  const step = useCallback(
    (dir: 1 | -1) =>
      setOpen((cur) => (cur === null ? cur : (cur + dir + photos.length) % photos.length)),
    [photos.length]
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, step]);

  const slot = (stripe: string): React.CSSProperties => ({
    background: `repeating-linear-gradient(45deg,${stripe} 0 12px,#E2D6B9 12px 24px)`,
    position: "relative",
    minHeight: 0,
    border: "none",
    padding: 0,
    cursor: photos.length ? "zoom-in" : "default",
    fontFamily: "inherit",
    color: "#1D1913",
  });

  const moreChip: React.CSSProperties = {
    position: "absolute",
    right: 10,
    bottom: 10,
    background: "#F6F1E6",
    border: "1.5px solid #1D1913",
    borderRadius: 99,
    fontSize: 9,
    fontWeight: 700,
    padding: "4px 9px",
  };

  const img = (url: string, alt: string, eager = false) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
      onError={(e) => { e.currentTarget.style.display = "none"; }}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
    />
  );

  const openAt = (i: number) => photos.length && setOpen(Math.min(i, photos.length - 1));

  return (
    <>
      {/* container-type wrapper stays clear of the fixed-position lightbox —
          layout containment would trap it */}
      <div className="ddfw-gallery-wrap">
        <style>{GALLERY_CSS}</style>
        <div
          className={`ddfw-gallery-collage ddfw-gallery-n${side.length}`}
          style={{
            position: "relative",
            border: "2px solid #1D1913",
            borderRadius: 20,
            overflow: "hidden",
            marginTop: 22,
            background: "#1D1913",
          }}
        >
          <button
            type="button"
            aria-label="Open photo gallery"
            onClick={() => openAt(0)}
            className="ddfw-gallery-slot ddfw-gallery-hero"
            style={slot("#EAE0C9")}
          >
            {/* placeholder always underneath; broken URLs hide themselves */}
            <span
              className="font-mono"
              style={{ fontSize: 9.5, letterSpacing: ".2em", color: "rgba(29,25,19,.5)", textAlign: "center", padding: 12 }}
            >
              MLS PHOTO 1 OF {listing.photoCount} — {(primary?.caption ?? listing.photoLabel).toUpperCase()}
            </span>
            {/* the dossier hero is the page's LCP — load it eagerly */}
            {primary?.url && img(primary.url, `${listing.unparsedAddress} — photo 1 of ${photos.length}`, true)}
            <span
              className="font-mono"
              style={{
                position: "absolute",
                bottom: 12,
                left: 12,
                background: "#1D1913",
                color: "#F6F1E6",
                fontSize: 8.5,
                letterSpacing: ".14em",
                borderRadius: 99,
                padding: "5px 10px",
              }}
            >
              ◧ {photos.length || listing.photoCount} PHOTOS
            </span>
            {/* clicks bubble to the hero button, which already opens at 0 */}
            {photos.length > 0 && (
              <span
                className="font-mono"
                style={{
                  position: "absolute",
                  right: 12,
                  bottom: 12,
                  background: "#F6F1E6",
                  color: "#1D1913",
                  border: "1.5px solid #1D1913",
                  borderRadius: 999,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: ".14em",
                  padding: "7px 12px",
                  boxShadow: "0 4px 10px rgba(20,16,10,.22)",
                }}
              >
                VIEW ALL {photos.length} PHOTOS
              </span>
            )}
          </button>
          {side.map((m, i) => (
            <button
              type="button"
              key={m.order}
              aria-label={`Open photo ${i + 2}`}
              onClick={() => openAt(i + 1)}
              className={`ddfw-gallery-slot ddfw-gallery-tile ddfw-gallery-tile-${i + 1}`}
              style={slot("#E6DBC2")}
            >
              <span
                className="font-mono"
                style={{ fontSize: 8.5, letterSpacing: ".16em", color: "rgba(29,25,19,.5)", textAlign: "center", padding: 10 }}
              >
                {(m.caption || "MLS PHOTO").toUpperCase()}
              </span>
              {m.url && img(m.url, `${listing.unparsedAddress} — photo ${i + 2}`)}
              {i === side.length - 1 && remaining > 0 && (
                <span className="font-mono" style={moreChip}>
                  +{remaining}
                </span>
              )}
              {side.length > 2 && i === 1 && remainingSm > 0 && (
                <span className="font-mono ddfw-gallery-more-sm" style={moreChip}>
                  +{remainingSm}
                </span>
              )}
            </button>
          ))}
          <span style={{ position: "absolute", top: 14, right: 14, zIndex: 2 }}>
            <SaveListingButton listingKey={listing.listingKey} listPrice={listing.listPrice} standardStatus={listing.standardStatus} size={40} />
          </span>
        </div>
      </div>

      {/* lightbox */}
      {open !== null && photos[open] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${open + 1} of ${photos.length}`}
          onClick={() => setOpen(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            background: "rgba(20,16,10,.94)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {broken.has(open) ? (
            <div
              onClick={(e) => e.stopPropagation()}
              className="font-mono"
              style={{
                border: "2px dashed rgba(246,241,230,.4)",
                borderRadius: 12,
                padding: "60px 40px",
                color: "rgba(246,241,230,.7)",
                fontSize: 10,
                letterSpacing: ".2em",
              }}
            >
              PHOTO UNAVAILABLE — THE MLS SOURCE DID NOT LOAD
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photos[open].url!}
              alt={`${listing.unparsedAddress} — photo ${open + 1} of ${photos.length}`}
              decoding="async"
              onClick={(e) => e.stopPropagation()}
              onError={() => markBroken(open)}
              style={{ maxWidth: "94vw", maxHeight: "86vh", objectFit: "contain", borderRadius: 8 }}
            />
          )}
          <button
            type="button"
            aria-label="Close gallery"
            onClick={() => setOpen(null)}
            className="font-mono"
            style={{
              position: "absolute",
              top: 18,
              right: 20,
              width: 40,
              height: 40,
              borderRadius: 99,
              border: "1.5px solid rgba(246,241,230,.5)",
              background: "transparent",
              color: "#F6F1E6",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={(e) => { e.stopPropagation(); step(-1); }}
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 46,
                  height: 46,
                  borderRadius: 99,
                  border: "1.5px solid rgba(246,241,230,.5)",
                  background: "rgba(29,25,19,.6)",
                  color: "#F6F1E6",
                  fontSize: 18,
                  cursor: "pointer",
                }}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={(e) => { e.stopPropagation(); step(1); }}
                style={{
                  position: "absolute",
                  right: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 46,
                  height: 46,
                  borderRadius: 99,
                  border: "1.5px solid rgba(246,241,230,.5)",
                  background: "rgba(29,25,19,.6)",
                  color: "#F6F1E6",
                  fontSize: 18,
                  cursor: "pointer",
                }}
              >
                ›
              </button>
            </>
          )}
          <span
            className="font-mono"
            style={{
              position: "absolute",
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
              color: "rgba(246,241,230,.85)",
              fontSize: 10,
              letterSpacing: ".22em",
              textAlign: "center",
              width: "94vw",
            }}
          >
            {open + 1} / {photos.length} — {listing.unparsedAddress.toUpperCase()}
            {/* IDX photo attribution rides along in the viewer too */}
            {listing.attributionText && (
              <span style={{ display: "block", marginTop: 5, fontSize: 8.5, color: "rgba(246,241,230,.55)" }}>
                {listing.attributionText.toUpperCase()} · {listing.mlsSource}
              </span>
            )}
          </span>
        </div>
      )}
    </>
  );
}
