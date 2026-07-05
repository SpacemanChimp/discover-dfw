"use client";
import { useShelf } from "@/lib/shelf";
import SoftAccountGate from "./SoftAccountGate";
import AuthModal from "./AuthModal";

/* Global overlay host: the save toast, the one-time soft gate, and the
   membership modal. Mounted once inside ShelfProvider in the root layout. */
export default function ShelfOverlays() {
  const shelf = useShelf();
  return (
    <>
      {shelf.toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            left: 16,
            right: 16,
            bottom: 24,
            zIndex: 100,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "#1D1913",
              color: "#F6F1E6",
              borderRadius: 14,
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 16px 36px rgba(20,16,10,.4)",
              maxWidth: 420,
              width: "100%",
              animation: "fadeUp .25s ease both",
            }}
          >
            <span style={{ color: "#E88D6B", fontSize: 16 }}>♥</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{shelf.toast}</span>
          </div>
        </div>
      )}
      <SoftAccountGate />
      <AuthModal />
    </>
  );
}
