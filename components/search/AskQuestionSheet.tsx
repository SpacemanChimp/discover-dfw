"use client";
import { useState } from "react";
import type { Listing } from "@/lib/listings/types";

const QUICK = [
  "Is it still available?",
  "Any offers yet?",
  "HOA or historic overlay?",
  "What’s the inspection story?",
];

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "2px solid #1D1913",
  borderRadius: 14,
  padding: "12px 15px",
  background: "#FBF7EE",
  fontSize: 13,
  fontFamily: "inherit",
  color: "#1D1913",
  outline: "none",
};

/* "One guide, not a lead list" — question sheet routed to the city's guide. */
export default function AskQuestionSheet({
  listing,
  cityName,
  open,
  onClose,
}: {
  listing: Listing;
  cityName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [pref, setPref] = useState<"text" | "email">("text");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    if (!q.trim()) {
      setErr("Ask something first — anything.");
      return;
    }
    if (!contact.trim()) {
      setErr(pref === "text" ? "Add the number to text you back at." : "Add the email to reply to.");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "question",
          listingKey: listing.listingKey,
          address: `${listing.unparsedAddress}, ${cityName}`,
          citySlug: listing.citySlug,
          message: q,
          replyPref: pref,
          email: pref === "email" ? contact : "",
          phone: pref === "text" ? contact : "",
        }),
      });
      if (!res.ok) throw new Error();
      setState("sent");
    } catch {
      setState("error");
      setErr("That didn’t go through — try once more.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ask a question about this home"
      onClick={onClose}
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
          padding: "14px 20px 32px",
          boxShadow: "0 -18px 44px rgba(20,16,10,.35)",
          maxWidth: 560,
          width: "100%",
          margin: "0 auto",
          maxHeight: "88vh",
          overflowY: "auto",
          animation: "fadeUp .3s ease both",
        }}
      >
        <div style={{ width: 44, height: 5, borderRadius: 99, background: "rgba(29,25,19,.25)", margin: "0 auto" }} />
        {state === "sent" ? (
          <div style={{ textAlign: "center", padding: "34px 0 22px" }}>
            <div className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".26em", color: "#D9481F" }}>
              SENT TO YOUR GUIDE
            </div>
            <div className="font-serif" style={{ fontWeight: 900, fontSize: 28, marginTop: 10 }}>
              Good question.
            </div>
            <p style={{ margin: "12px auto 0", maxWidth: 380, fontSize: 14, lineHeight: 1.6, color: "rgba(29,25,19,.75)" }}>
              Your {cityName} guide will {pref === "text" ? "text" : "email"} you back — usually inside
              ten minutes during the day.
            </p>
            <button type="button" onClick={onClose} style={{ ...input, borderRadius: 999, marginTop: 20, cursor: "pointer", fontWeight: 700 }}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                marginTop: 18,
                border: "2px solid #1D1913",
                borderRadius: 16,
                background: "#FBF7EE",
                padding: "13px 15px",
              }}
            >
              <span
                className="font-serif"
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 99,
                  background: "#1D1913",
                  color: "#F6F1E6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 17,
                  flexShrink: 0,
                }}
              >
                {cityName.slice(0, 1).toUpperCase()}G
              </span>
              <div style={{ flex: 1 }}>
                <div className="font-serif" style={{ fontWeight: 800, fontSize: 16.5 }}>
                  Your {cityName} guide
                </div>
                <div className="font-mono" style={{ fontSize: 8, letterSpacing: ".14em", color: "rgba(29,25,19,.55)", marginTop: 2 }}>
                  ONE LOCAL GUIDE · REPLIES IN ~10 MIN
                </div>
              </div>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: "#2E7D4F" }} />
            </div>
            <div className="font-mono" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".2em", color: "rgba(29,25,19,.5)", marginTop: 16 }}>
              ABOUT {listing.unparsedAddress.toUpperCase()} — TAP TO ASK
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 9 }}>
              {QUICK.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setQ(s);
                    setErr(null);
                  }}
                  style={{
                    border: q === s ? "1.5px solid #D9481F" : "1.5px solid #1D1913",
                    borderRadius: 999,
                    padding: "8px 13px",
                    fontSize: 12,
                    fontWeight: 600,
                    background: q === s ? "rgba(217,72,31,.08)" : "#FBF7EE",
                    color: q === s ? "#D9481F" : "#1D1913",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <textarea
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setErr(null);
              }}
              placeholder="Or ask it your way…"
              rows={3}
              style={{ ...input, marginTop: 13, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {(["text", "email"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPref(p)}
                  className="font-mono"
                  style={{
                    flex: 1,
                    border: "1.5px solid #1D1913",
                    borderRadius: 999,
                    padding: "10px 0",
                    textAlign: "center",
                    fontSize: 8.5,
                    fontWeight: pref === p ? 700 : 400,
                    letterSpacing: ".12em",
                    background: pref === p ? "#1D1913" : "#FBF7EE",
                    color: pref === p ? "#F6F1E6" : "#1D1913",
                    cursor: "pointer",
                  }}
                >
                  {p === "text" ? "↩ TEXT ME" : "✉ EMAIL ME"}
                </button>
              ))}
            </div>
            <input
              type={pref === "email" ? "email" : "tel"}
              value={contact}
              onChange={(e) => {
                setContact(e.target.value);
                setErr(null);
              }}
              placeholder={pref === "text" ? "Your phone number" : "Your email"}
              style={{ ...input, marginTop: 8 }}
            />
            {err && (
              <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".1em", color: "#D9481F", marginTop: 8 }}>
                {err.toUpperCase()}
              </div>
            )}
            <button
              type="button"
              disabled={state === "sending"}
              onClick={submit}
              className="btn-primary"
              style={{
                width: "100%",
                background: "#D9481F",
                color: "#F6F1E6",
                borderRadius: 999,
                padding: "16px 0",
                textAlign: "center",
                fontWeight: 700,
                fontSize: 14.5,
                marginTop: 12,
                border: "2px solid #D9481F",
                cursor: state === "sending" ? "wait" : "pointer",
                fontFamily: "inherit",
                opacity: state === "sending" ? 0.7 : 1,
              }}
            >
              {state === "sending" ? "Sending…" : "Send to your guide"}
            </button>
            <div
              className="font-mono"
              style={{ textAlign: "center", fontSize: 8, letterSpacing: ".16em", color: "rgba(29,25,19,.5)", marginTop: 12 }}
            >
              YOUR INFO GOES TO ONE GUIDE — NEVER A LEAD LIST
            </div>
          </>
        )}
      </div>
    </div>
  );
}
