"use client";
import { useEffect, useRef } from "react";

/* Shared success view for the lead sheets — the moment after a showing
   request or question goes through. One voice for both: personal,
   specific, never call-center. */
export default function LeadSuccessState({
  eyebrow,
  headline,
  body,
  onClose,
}: {
  eyebrow: string;
  headline: string;
  body: string;
  onClose: () => void;
}) {
  // success swaps the whole sheet body — hand focus to its only action
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    doneRef.current?.focus();
  }, []);
  return (
    <div style={{ textAlign: "center", padding: "34px 0 22px" }}>
      <div
        className="font-mono"
        style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".26em", color: "#C13E17" }}
      >
        {eyebrow}
      </div>
      <div className="font-serif" style={{ fontWeight: 900, fontSize: 28, marginTop: 10 }}>
        {headline}
      </div>
      <p style={{ margin: "12px auto 0", maxWidth: 380, fontSize: 14, lineHeight: 1.6, color: "rgba(29,25,19,.75)" }}>
        {body}
      </p>
      <button
        type="button"
        ref={doneRef}
        onClick={onClose}
        style={{
          width: "100%",
          boxSizing: "border-box",
          border: "2px solid #1D1913",
          borderRadius: 999,
          padding: "12px 15px",
          background: "#FBF7EE",
          fontSize: 13,
          fontFamily: "inherit",
          color: "#1D1913",
          marginTop: 20,
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        Done
      </button>
    </div>
  );
}
