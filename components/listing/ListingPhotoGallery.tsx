import type { Listing } from "@/lib/mls/types";
import SaveListingButton from "@/components/search/SaveListingButton";

/* Gallery collage PLACEHOLDER — primary slot + two secondary slots from the
   media captions, with the +N chip. Real photos arrive with the IDX CDN;
   every slot renders its caption until then. */
export default function ListingPhotoGallery({ listing }: { listing: Listing }) {
  const [primary, ...rest] = listing.media;
  const side = rest.slice(0, 2);
  const remaining = Math.max(0, listing.photoCount - 1 - side.length);

  const slot = (caption: string, stripe: string): React.CSSProperties => ({
    background: `repeating-linear-gradient(45deg,${stripe} 0 12px,#E2D6B9 12px 24px)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    minHeight: 0,
  });

  return (
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
      <div style={{ ...slot(primary?.caption ?? listing.photoLabel, "#EAE0C9"), gridRow: "span 2" }}>
        <span
          className="font-mono"
          style={{ fontSize: 9.5, letterSpacing: ".2em", color: "rgba(29,25,19,.5)", textAlign: "center", padding: 12 }}
        >
          MLS PHOTO 1 OF {listing.photoCount} — {(primary?.caption ?? listing.photoLabel).toUpperCase()}
        </span>
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
          ◧ {listing.photoCount} PHOTOS
        </span>
      </div>
      {side.map((m, i) => (
        <div key={m.order} style={slot(m.caption, "#E6DBC2")}>
          <span
            className="font-mono"
            style={{ fontSize: 8.5, letterSpacing: ".16em", color: "rgba(29,25,19,.5)", textAlign: "center", padding: 10 }}
          >
            {m.caption.toUpperCase()}
          </span>
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
        </div>
      ))}
      {side.length === 0 && (
        <div style={{ ...slot("", "#E6DBC2"), gridRow: "span 2" }}>
          <span className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".16em", color: "rgba(29,25,19,.5)" }}>
            MORE PHOTOS WITH THE LIVE FEED
          </span>
        </div>
      )}
      <span style={{ position: "absolute", top: 14, right: 14, zIndex: 2 }}>
        <SaveListingButton listingKey={listing.listingKey} listPrice={listing.listPrice} standardStatus={listing.standardStatus} size={40} />
      </span>
    </div>
  );
}
