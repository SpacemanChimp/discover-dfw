"use client";
import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { useShelf } from "@/lib/shelf";

/* Sticky nav for the search surfaces: wordmark, section links, and the
   MY SHELF pill with a live count. */
export default function SearchNav() {
  const shelf = useShelf();
  return (
    <nav
      className="homes-search-nav"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 18,
        padding: "13px 4vw",
        background: "rgba(246,241,230,.92)",
        backdropFilter: "blur(14px)",
        borderBottom: "2px solid #1D1913",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22, minWidth: 0 }}>
        <Wordmark href="/" fontSize={19} />
        <Link href="/#map" className="city-back font-mono" style={navLink}>
          THE MAP
        </Link>
        <Link href="/#cities" className="city-back font-mono" style={{ ...navLink }}>
          THE INDEX
        </Link>
        <span
          className="font-mono"
          style={{ ...navLink, color: "#1D1913", borderBottom: "2px solid #D9481F", paddingBottom: 4 }}
        >
          SEARCH HOMES
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* always in the layout — visibility flips on hydration so the nav
            never reflows when the shelf wakes up */}
        {!shelf.account && (
          <button
            type="button"
            onClick={shelf.openAuth}
            className="font-mono city-back"
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: ".16em",
              color: "#C13E17",
              background: "none",
              border: "none",
              padding: "12px 10px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              visibility: shelf.ready ? "visible" : "hidden",
            }}
          >
            SIGN IN
          </button>
        )}
        <Link
          href="/account/saved-homes"
          className="font-mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            border: "2px solid #1D1913",
            borderRadius: 999,
            padding: "9px 18px",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".1em",
            color: "#1D1913",
            textDecoration: "none",
            background: "#F6F1E6",
          }}
        >
          {shelf.ready && shelf.savedCount > 0 ? "♥" : "♡"} MY SHELF
          {/* badge space is always reserved — ♡→♥+count must not nudge the nav */}
          <span
            style={{
              background: "#C13E17",
              color: "#F6F1E6",
              borderRadius: 99,
              fontSize: 10,
              padding: "2px 7px",
              minWidth: 24,
              textAlign: "center",
              visibility: shelf.ready && shelf.savedCount > 0 ? "visible" : "hidden",
            }}
          >
            {shelf.ready && shelf.savedCount > 0 ? shelf.savedCount : 0}
          </span>
        </Link>
      </div>
    </nav>
  );
}

const navLink: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: ".18em",
  color: "rgba(29,25,19,.65)",
  textDecoration: "none",
  whiteSpace: "nowrap",
  fontWeight: 600,
};
