import Link from "next/link";
import { getMlsProvider } from "@/lib/mls";
import type { Listing } from "@/lib/mls/types";

/* "Nearby on the market" — a radius search (3 mi) around this listing's
   coordinates. Server component; a provider hiccup renders nothing rather
   than breaking the dossier. */
export default async function NearbyListings({ listing }: { listing: Listing }) {
  if (!listing.lonLat) return null;

  let nearby: Listing[] = [];
  try {
    const result = await getMlsProvider().searchListings({
      center: listing.lonLat,
      radiusMiles: 3,
      statuses: ["Active"],
      pageSize: 5,
    });
    nearby = result.listings.filter((l) => l.listingKey !== listing.listingKey).slice(0, 4);
  } catch {
    return null;
  }
  if (!nearby.length) return null;

  return (
    <section style={{ maxWidth: 860, margin: "0 auto", padding: "8px 4vw 30px" }}>
      <div
        className="font-mono"
        style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".24em", color: "#C13E17", marginBottom: 12 }}
      >
        NEARBY ON THE MARKET — WITHIN 3 MILES
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12 }}>
        {nearby.map((l) => (
          <Link
            key={l.listingKey}
            href={`/listing/${l.listingKey}`}
            style={{
              border: "2px solid #1D1913",
              borderRadius: 14,
              background: "#FBF7EE",
              overflow: "hidden",
              textDecoration: "none",
              color: "#1D1913",
              display: "block",
            }}
          >
            <div
              style={{
                height: 110,
                position: "relative",
                background: "repeating-linear-gradient(45deg,#EAE0C9 0 12px,#E2D6B9 12px 24px)",
                borderBottom: "1.5px solid #1D1913",
              }}
            >
              {l.media[0]?.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={l.media[0].url}
                  alt={`${l.unparsedAddress}, ${l.cityName}`}
                  loading="lazy"
                  decoding="async"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                />
              )}
            </div>
            <div style={{ padding: "10px 12px 12px" }}>
              <div className="font-serif" style={{ fontWeight: 800, fontSize: 19, color: "#D9481F" }}>
                ${l.listPrice.toLocaleString("en-US")}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.unparsedAddress}
              </div>
              <div className="font-mono" style={{ fontSize: 8, letterSpacing: ".12em", color: "rgba(29,25,19,.62)", marginTop: 4 }}>
                {l.bedsTotal} BD · {l.bathsTotal} BA{l.livingAreaSqft ? ` · ${l.livingAreaSqft.toLocaleString("en-US")} SQFT` : ""}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
