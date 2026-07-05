"use client";
import Link from "next/link";
import { useShelf } from "@/lib/shelf";
import SavedSearchCard from "./SavedSearchCard";

/* "Standing orders" — saved searches with cadence + email controls.
   Standing orders live server-side only; guests see the membership nudge. */
export default function SavedSearchesDashboard() {
  const shelf = useShelf();

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
        <Link
          href="/account/saved-homes"
          className="font-mono"
          style={{ flex: 1, textAlign: "center", padding: "12px 0", fontSize: 9.5, letterSpacing: ".14em", color: "#1D1913", textDecoration: "none" }}
        >
          {shelf.savedCount} {shelf.savedCount === 1 ? "HOME" : "HOMES"}
        </Link>
        <span
          className="font-mono"
          style={{ flex: 1, textAlign: "center", padding: "12px 0", fontSize: 9.5, fontWeight: 700, letterSpacing: ".14em", background: "#1D1913", color: "#F6F1E6" }}
        >
          {shelf.searches.length} {shelf.searches.length === 1 ? "SEARCH" : "SEARCHES"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 20 }}>
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
            color: "#D9481F",
            textDecoration: "none",
          }}
        >
          ＋ START A SEARCH TO SAVE
        </Link>
        <div className="font-mono" style={{ textAlign: "center", fontSize: 8, letterSpacing: ".16em", color: "rgba(29,25,19,.45)", paddingBottom: 6 }}>
          ALERT EMAILS FOR SEARCHES ARRIVE IN A LATER PHASE — PREFERENCES ARE SAVED NOW
        </div>
      </div>
    </div>
  );
}
