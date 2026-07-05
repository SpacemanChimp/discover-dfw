"use client";
import { useShelf } from "@/lib/shelf";

/* The soft ask — shown once, ~1s after the first guest save. Never blocks:
   "Keep browsing as a guest" is a first-class choice. */
export default function SoftAccountGate() {
  const shelf = useShelf();
  if (!shelf.gateOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Save your shelf with a free account"
      onClick={shelf.closeGate}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(29,25,19,.55)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#F6F1E6",
          borderTop: "2px solid #1D1913",
          borderRadius: "24px 24px 0 0",
          padding: "14px 20px 34px",
          boxShadow: "0 -18px 44px rgba(20,16,10,.35)",
          maxWidth: 560,
          width: "100%",
          margin: "0 auto",
          animation: "fadeUp .3s ease both",
        }}
      >
        <div style={{ width: 44, height: 5, borderRadius: 99, background: "rgba(29,25,19,.25)", margin: "0 auto" }} />
        <div
          className="font-mono"
          style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".26em", color: "#D9481F", marginTop: 18 }}
        >
          YOUR SHELF — {shelf.savedCount} {shelf.savedCount === 1 ? "HOME" : "HOMES"}
        </div>
        <div className="font-serif" style={{ fontWeight: 900, fontSize: 30, lineHeight: 1.05, marginTop: 8 }}>
          Keep it safe.
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.65, color: "rgba(29,25,19,.75)" }}>
          Your shelf lives on this device for now. A free account carries it everywhere — and
          we&rsquo;ll whisper when a saved home cuts its price.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          <button
            type="button"
            onClick={shelf.openAuth}
            className="btn-primary"
            style={{
              background: "#D9481F",
              color: "#F6F1E6",
              borderRadius: 999,
              padding: "16px 0",
              textAlign: "center",
              fontWeight: 700,
              fontSize: 14.5,
              border: "2px solid #D9481F",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Create a free account
          </button>
          <button
            type="button"
            onClick={shelf.closeGate}
            style={{
              border: "2px solid #1D1913",
              borderRadius: 999,
              padding: "15px 0",
              textAlign: "center",
              fontWeight: 700,
              fontSize: 14,
              background: "#F6F1E6",
              color: "#1D1913",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Keep browsing as a guest
          </button>
        </div>
        <div
          className="font-mono"
          style={{ textAlign: "center", fontSize: 8.5, letterSpacing: ".18em", color: "rgba(29,25,19,.5)", marginTop: 14 }}
        >
          NO SPAM — JUST THE HOUSES.
        </div>
      </div>
    </div>
  );
}
