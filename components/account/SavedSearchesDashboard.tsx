"use client";
import Link from "next/link";
import { useShelf } from "@/lib/shelf";
import SavedSearchCard from "./SavedSearchCard";

/* "Standing orders" — saved searches with cadence + email controls.
   Standing orders live server-side only; guests see the membership nudge.
   Until the shelf hydrates we show card-shaped skeletons, never a
   false-empty. */
export default function SavedSearchesDashboard() {
  const shelf = useShelf();

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "26px 4vw 100px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 className="font-serif" style={{ margin: 0, fontWeight: 900, fontSize: "clamp(30px,5vw,40px)" }}>
          Your shelf.
        </h1>
        <span className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".16em", color: "rgba(29,25,19,.62)" }}>
          {shelf.account ? `SYNCED ✓ · ${shelf.account.email.toUpperCase()}` : "GUEST SHELF"}
        </span>
      </div>

      {/* tabs pill */}
      <div style={{ display: "flex", border: "2px solid #1D1913", borderRadius: 999, marginTop: 16, overflow: "hidden" }}>
        <Link
          href="/account/saved-homes"
          className="font-mono"
          style={{ flex: 1, textAlign: "center", padding: "14px 0", fontSize: 9.5, letterSpacing: ".14em", color: "#1D1913", textDecoration: "none" }}
        >
          {shelf.ready ? shelf.savedCount : "—"} {shelf.savedCount === 1 ? "HOME" : "HOMES"}
        </Link>
        <span
          className="font-mono"
          style={{ flex: 1, textAlign: "center", padding: "14px 0", fontSize: 9.5, fontWeight: 700, letterSpacing: ".14em", background: "#1D1913", color: "#F6F1E6" }}
        >
          {shelf.ready ? shelf.searches.length : "—"} {shelf.searches.length === 1 ? "SEARCH" : "SEARCHES"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 20 }}>
        {/* card-shaped shimmer while the shelf hydrates */}
        {!shelf.ready && (
          <div aria-busy="true" aria-label="Loading saved searches" style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="rail-skeleton-card"
                style={{ border: "2px solid #1D1913", borderRadius: 15, background: "#FBF7EE", padding: "14px 16px" }}
              >
                <div style={{ height: 16, width: "46%", borderRadius: 6, background: "rgba(29,25,19,.1)" }} />
                <div style={{ height: 10, width: "70%", borderRadius: 6, background: "rgba(29,25,19,.08)", marginTop: 9 }} />
                <div style={{ height: 28, width: "58%", borderRadius: 999, background: "rgba(29,25,19,.06)", marginTop: 14 }} />
              </div>
            ))}
          </div>
        )}

        {/* empty states */}
        {shelf.ready && shelf.searches.length === 0 && (
          <div style={{ textAlign: "center", padding: "50px 0 20px" }}>
            <div className="font-serif" style={{ fontStyle: "italic", fontWeight: 600, fontSize: 22, color: "rgba(29,25,19,.7)" }}>
              No standing orders yet.
            </div>
            {shelf.account ? (
              <p style={{ margin: "10px auto 0", maxWidth: 360, fontSize: 14, lineHeight: 1.6, color: "rgba(29,25,19,.6)" }}>
                Dial in a search and hit ♡ SAVE THIS SEARCH — we&rsquo;ll watch the market and
                whisper when something new lands.
              </p>
            ) : (
              <>
                <p style={{ margin: "10px auto 0", maxWidth: 380, fontSize: 14, lineHeight: 1.6, color: "rgba(29,25,19,.6)" }}>
                  Standing orders travel with an account — sign in free and any search you save
                  gets watched for you.
                </p>
                <button
                  type="button"
                  onClick={shelf.openAuth}
                  className="btn-primary"
                  style={{
                    display: "inline-block",
                    marginTop: 18,
                    background: "#D9481F",
                    color: "#F6F1E6",
                    borderRadius: 999,
                    padding: "13px 26px",
                    fontWeight: 700,
                    fontSize: 14,
                    border: "2px solid #D9481F",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Create a free account
                </button>
              </>
            )}
          </div>
        )}

        {shelf.searches.map((s) => (
          <SavedSearchCard key={s.id} search={s} />
        ))}

        {shelf.ready && (
          <Link
            href="/homes"
            className="font-mono"
            style={{
              border: "2px dashed rgba(217,72,31,.55)",
              borderRadius: 15,
              padding: "14px 0",
              textAlign: "center",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: ".16em",
              color: "#C13E17",
              textDecoration: "none",
            }}
          >
            ＋ START A SEARCH TO SAVE
          </Link>
        )}
        <div className="font-mono" style={{ textAlign: "center", fontSize: 8, letterSpacing: ".16em", color: "rgba(29,25,19,.62)", paddingBottom: 6 }}>
          DIGESTS RIDE THE DAILY SWEEP — FLIP ✉ EMAIL OR THE CADENCE ANY TIME
        </div>
      </div>
    </div>
  );
}
