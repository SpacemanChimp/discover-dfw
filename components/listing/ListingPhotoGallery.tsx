"use client";
import { useCallback, useEffect, useState } from "react";
import type { Listing } from "@/lib/mls/types";
import SaveListingButton from "@/components/search/SaveListingButton";

/* Gallery collage — primary slot + two secondary slots, with the photo-count
   and +N chips. Every photo and chip opens the lightbox: full-bleed viewer
   over all replicated photos with arrow/keyboard navigation and a counter.
   Slots fall back to the striped caption placeholder when the feed supplies
   no URL (mock mode). */
export default function ListingPhotoGallery({ listing }: { listing: Listing }) {
  const photos = listing.media.filter((m) => m.url);
  const [primary, ...rest] = listing.media;
  const side = rest.slice(0, 2);
  const remaining = Math.max(0, photos.length - 1 - side.length);
  const [open, setOpen] = useState<number | null>(null);

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
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    minHeight: 0,
    border: "none",
    padding: 0,
    cursor: photos.length ? "zoom-in" : "default",
    fontFamily: "inherit",
    color: "#1D1913",
  });

  const img = (url: string, alt: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading="lazy"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
    />
  );

  const openAt = (i: number) => photos.length && setOpen(Math.min(i, photos.length - 1));

  return (
    <>
      <div
        style={{
          position: "relative",
          border: "2px solid #1D1913",
          borderRadius: 20,
          overflow: "hidden",
          marginTop: 22,
          display: "grid",
          gridTemplateColumns: "1.7fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: 3,
          background: "#1D1913",
          height: "clamp(280px, 44vw, 440px)",
        }}
      >
        <button type="button" aria-label="Open photo gallery" onClick={() => openAt(0)} style={{ ...slot("#EAE0C9"), gridRow: "span 2" }}>
          {primary?.url ? (
            img(primary.url, `${listing.unparsedAddress} — photo 1 of ${photos.length}`)
          ) : (
            <span
              className="font-mono"
              style={{ fontSize: 9.5, letterSpacing: ".2em", color: "rgba(29,25,19,.5)", textAlign: "center", padding: 12 }}
            >
              MLS PHOTO 1 OF {listing.photoCount} — {(primary?.caption ?? listing.photoLabel).toUpperCase()}
            </span>
          )}
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
        </button>
        {side.map((m, i) => (
          <button type="button" key={m.order} aria-label={`Open photo ${i + 2}`} onClick={() => openAt(i + 1)} style={slot("#E6DBC2")}>
            {m.url ? (
              img(m.url, `${listing.unparsedAddress} — photo ${i + 2}`)
            ) : (
              <span
                className="font-mono"
                style={{ fontSize: 8.5, letterSpacing: ".16em", color: "rgba(29,25,19,.5)", textAlign: "center", padding: 10 }}
              >
                {m.caption.toUpperCase()}
              </span>
            )}
            {i === side.length - 1 && remaining > 0 && (
              <span
                className="font-mono"
                style={{
                  position: "absolute",
                  right: 10,
                  bottom: 10,
                  background: "#F6F1E6",
                  border: "1.5px solid #1D1913",
                  borderRadius: 99,
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "4px 9px",
                }}
              >
                +{remaining}
              </span>
            )}
          </button>
        ))}
        {side.length === 0 && (
          <div style={{ ...slot("#E6DBC2"), gridRow: "span 2", cursor: "default" }}>
            <span className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".16em", color: "rgba(29,25,19,.5)" }}>
              MORE PHOTOS WITH THE LIVE FEED
            </span>
          </div>
        )}
        <span style={{ position: "absolute", top: 14, right: 14, zIndex: 2 }}>
          <SaveListingButton listingKey={listing.listingKey} listPrice={listing.listPrice} standardStatus={listing.standardStatus} size={40} />
        </span>
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[open].url!}
            alt={`${listing.unparsedAddress} — photo ${open + 1} of ${photos.length}`}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "94vw", maxHeight: "86vh", objectFit: "contain", borderRadius: 8 }}
          />
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
              bottom: 20,
              left: "50%",
              transform: "translateX(-50%)",
              color: "rgba(246,241,230,.85)",
              fontSize: 10,
              letterSpacing: ".22em",
            }}
          >
            {open + 1} / {photos.length} — {listing.unparsedAddress.toUpperCase()}
          </span>
        </div>
      )}
    </>
  );
}
