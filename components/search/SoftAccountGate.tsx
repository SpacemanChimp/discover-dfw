"use client";
import { useEffect, useRef } from "react";
import { useShelf } from "@/lib/shelf";
import { useDialogA11y } from "@/lib/use-dialog-a11y";

/* The soft ask — shown once, ~1s after the first guest save. Never blocks:
   "Keep browsing as a guest" is a first-class choice. */
export default function SoftAccountGate() {
  const shelf = useShelf();
  const panelRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  useDialogA11y({ open: shelf.gateOpen, onClose: shelf.closeGate, panelRef });

  // land on the primary action, not the bare panel
  useEffect(() => {
    if (shelf.gateOpen) primaryRef.current?.focus();
  }, [shelf.gateOpen]);

  if (!shelf.gateOpen) return null;
  // copy follows the ACTION that opened the gate: a save-search ask leads
  // with the search and its alerts; a saved-home ask leads with the shelf
  const forSearch = shelf.gateContext === "save-search";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={forSearch ? "Save this search with a free account" : "Save your shelf with a free account"}
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
        ref={panelRef}
        tabIndex={-1}
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
          outline: "none",
        }}
      >
        <div style={{ width: 44, height: 5, borderRadius: 99, background: "rgba(29,25,19,.25)", margin: "0 auto" }} />
        <div
          className="font-mono"
          style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".26em", color: "#C13E17", marginTop: 18 }}
        >
          {forSearch ? "SAVE THIS SEARCH" : `YOUR SHELF — ${shelf.savedCount} ${shelf.savedCount === 1 ? "HOME" : "HOMES"}`}
        </div>
        <div className="font-serif" style={{ fontWeight: 900, fontSize: 30, lineHeight: 1.05, marginTop: 8 }}>
          {forSearch ? "Never miss a match." : "Keep it safe."}
        </div>
        {forSearch ? (
          <>
            <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.65, color: "rgba(29,25,19,.75)" }}>
              A free account turns this search into a standing order. We watch the market and email you:
            </p>
            <ul style={{ margin: "10px 0 0", padding: "0 0 0 20px", fontSize: 14, lineHeight: 1.85, color: "rgba(29,25,19,.75)" }}>
              <li>New-listing alerts the moment a match hits the MLS</li>
              <li>Price-change alerts on homes in your search</li>
              <li>Status-change alerts when one goes pending or comes back</li>
            </ul>
          </>
        ) : (
          <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.65, color: "rgba(29,25,19,.75)" }}>
            Your shelf lives on this device for now. A free account carries it everywhere — and
            we&rsquo;ll whisper when a saved home cuts its price.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          <button
            type="button"
            ref={primaryRef}
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
          style={{ textAlign: "center", fontSize: 8.5, letterSpacing: ".18em", color: "rgba(29,25,19,.62)", marginTop: 14 }}
        >
          NO SPAM — JUST THE HOUSES.
        </div>
      </div>
    </div>
  );
}
