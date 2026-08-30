"use client";
import { useShelf } from "@/lib/shelf";
import { track } from "@/lib/analytics/track";

/* The one clear "why sign up" moment near the top of the homepage — an
   editorial row, not a marketing card: thin rule, plain benefits, a single
   text-weight action that opens the EXISTING registration modal directly.
   Renders nothing for signed-in visitors. Never auto-opens anything. */
export default function AccountCta() {
  const shelf = useShelf();
  if (shelf.ready && shelf.account) return null;
  return (
    <div
      style={{
        borderTop: "1px solid rgba(29,25,19,.28)",
        marginTop: 34,
        paddingTop: 18,
        display: "flex",
        gap: 16,
        alignItems: "baseline",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1 1 380px", minWidth: 0 }}>
        <span className="font-serif" style={{ fontWeight: 800, fontSize: 18 }}>
          Create your free account.
        </span>{" "}
        <span style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(29,25,19,.68)" }}>
          Save homes and searches, get price and status alerts, and keep your shortlist across devices.
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          track("signup_modal_open", { intent: "account-cta" });
          shelf.openAuth();
        }}
        className="font-mono link-underline"
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: ".18em",
          color: "#C13E17",
          background: "none",
          border: "none",
          padding: "10px 0",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        CREATE FREE ACCOUNT →
      </button>
    </div>
  );
}
