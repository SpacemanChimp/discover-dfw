"use client";
import Link from "next/link";
import { useShelf } from "@/lib/shelf";

/* "Standing orders" — saved searches with their alert cadence. */
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
        {shelf.ready && shelf.searches.length === 0 && (
          <div style={{ textAlign: "center", padding: "50px 0 20px" }}>
            <div className="font-serif" style={{ fontStyle: "italic", fontWeight: 600, fontSize: 22, color: "rgba(29,25,19,.7)" }}>
              No standing orders yet.
            </div>
            <p style={{ margin: "10px auto 0", maxWidth: 360, fontSize: 14, lineHeight: 1.6, color: "rgba(29,25,19,.6)" }}>
              Dial in a search and hit ♡ SAVE THIS SEARCH — we&rsquo;ll watch the market and whisper
              when something new lands.
            </p>
          </div>
        )}
        {shelf.searches.map((s) => (
          <article key={s.id} style={{ border: "2px solid #1D1913", borderRadius: 15, background: "#FBF7EE", padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div className="font-serif" style={{ fontWeight: 800, fontSize: 16.5, lineHeight: 1.25 }}>
                {s.name}
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".1em", color: "rgba(29,25,19,.55)", marginTop: 6 }}>
              {s.queryLabel.toUpperCase()}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                marginTop: 11,
                borderTop: "1px solid rgba(29,25,19,.14)",
                paddingTop: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                className="font-mono"
                style={{
                  border: "1.5px solid rgba(29,25,19,.4)",
                  borderRadius: 99,
                  fontSize: 8,
                  letterSpacing: ".12em",
                  padding: "5px 10px",
                  color: "rgba(29,25,19,.65)",
                }}
              >
                ✉ {s.frequency.toUpperCase()} — ALERTS ARRIVE IN PHASE 2
              </span>
              <span className="font-mono" style={{ display: "flex", gap: 14, fontSize: 8.5, fontWeight: 700, letterSpacing: ".12em" }}>
                <button
                  type="button"
                  onClick={() => shelf.removeSearch(s.id)}
                  style={{ color: "rgba(29,25,19,.55)", background: "none", border: "none", cursor: "pointer", font: "inherit", letterSpacing: "inherit" }}
                >
                  REMOVE
                </button>
                <Link href={`/homes?${s.queryString}`} style={{ color: "#D9481F", textDecoration: "none" }}>
                  RUN →
                </Link>
              </span>
            </div>
          </article>
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
          EVERY SEARCH CAN JOIN THE LETTER — ONE CALM EMAIL, NEVER SPAM
        </div>
      </div>
    </div>
  );
}
