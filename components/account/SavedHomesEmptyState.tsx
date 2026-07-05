import Link from "next/link";

/* Empty shelf — first-run state for /account/saved-homes. */
export default function SavedHomesEmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "70px 0 40px" }}>
      <div
        className="font-serif"
        style={{ fontStyle: "italic", fontWeight: 600, fontSize: 22, color: "rgba(29,25,19,.7)" }}
      >
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
  );
}
