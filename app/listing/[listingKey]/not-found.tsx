import Link from "next/link";
import SearchNav from "@/components/search/SearchNav";

/* Branded 404 for unknown or off-market listing keys. */
export default function ListingNotFound() {
  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      <SearchNav />
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "90px 4vw 120px", textAlign: "center" }}>
        <div
          className="font-mono"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".26em", color: "#D9481F" }}
        >
          OFF THE LEDGER
        </div>
        <h1
          className="font-serif"
          style={{ margin: "14px 0 0", fontWeight: 900, fontSize: "clamp(34px,6vw,54px)", lineHeight: 1.02 }}
        >
          That home isn&rsquo;t in the file.
        </h1>
        <p style={{ margin: "16px auto 0", maxWidth: 440, fontSize: 15, lineHeight: 1.7, color: "rgba(29,25,19,.7)" }}>
          It may have sold, gone off market, or the link took a wrong turn at the courthouse
          square. The search is right where you left it.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 26 }}>
          <Link
            href="/homes"
            className="btn-primary"
            style={{
              background: "#D9481F",
              color: "#F6F1E6",
              borderRadius: 999,
              padding: "14px 26px",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
              border: "2px solid #D9481F",
            }}
          >
            Back to the search
          </Link>
          <Link
            href="/account/saved-homes"
            style={{
              border: "2px solid #1D1913",
              borderRadius: 999,
              padding: "14px 26px",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
              color: "#1D1913",
              background: "#F6F1E6",
            }}
          >
            Your shelf
          </Link>
        </div>
      </div>
    </div>
  );
}
