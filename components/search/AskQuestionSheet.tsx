"use client";
import { useEffect, useRef, useState } from "react";
import type { Listing } from "@/lib/mls/types";
import { useShelf } from "@/lib/shelf";
import { getSessionId } from "@/lib/session-id";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import LeadSuccessState from "./LeadSuccessState";

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
  fontSize: 16, // ≥16px keeps iOS Safari from zooming the sheet on focus
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
  const shelf = useShelf();
  const [q, setQ] = useState("");
  const [pref, setPref] = useState<"text" | "email">("text");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [hp, setHp] = useState(""); // honeypot — humans never see it
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const openedAt = useRef(Date.now());
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y({ open, onClose, panelRef });

  // each open: fresh spam clock + prefill from the signed-in account
  useEffect(() => {
    if (!open) return;
    openedAt.current = Date.now();
    if (shelf.account) {
      setName((n) => n || shelf.account?.name || "");
      setEmail((e) => e || shelf.account?.email || "");
    }
  }, [open, shelf.account]);

  if (!open) return null;

  const submit = async () => {
    if (!q.trim()) {
      setErr("Ask something first — anything.");
      return;
    }
    if (!name.trim()) {
      setErr("Add your name so the guide knows who's asking.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr("Add the email your guide can reply to.");
      return;
    }
    if (pref === "text" && !phone.trim()) {
      setErr("Add the number to text you back at.");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/listing-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingKey: listing.listingKey,
          citySlug: listing.citySlug,
          community: listing.neighborhood || undefined,
          address: `${listing.unparsedAddress}, ${cityName}`,
          question: q,
          name,
          email,
          phone,
          replyPref: pref,
          sourcePage: window.location.pathname + window.location.search,
          referrer: document.referrer || undefined,
          sessionId: getSessionId(),
          hp,
          openedAt: openedAt.current,
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
        ref={panelRef}
        tabIndex={-1}
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
          outline: "none",
        }}
      >
        <div style={{ width: 44, height: 5, borderRadius: 99, background: "rgba(29,25,19,.25)", margin: "0 auto" }} />
        {state === "sent" ? (
          <LeadSuccessState
            eyebrow="SENT TO YOUR GUIDE"
            headline="Good question."
            body={`Your ${cityName} guide will ${pref === "text" ? "text" : "email"} you back — one guide, not a lead list, usually inside ten minutes during the day.`}
            onClose={onClose}
          />
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
                <div className="font-mono" style={{ fontSize: 8, letterSpacing: ".14em", color: "rgba(29,25,19,.62)", marginTop: 2 }}>
                  ONE LOCAL GUIDE · REPLIES IN ~10 MIN
                </div>
              </div>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: "#2E7D4F" }} />
            </div>
            <div className="font-mono" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".2em", color: "rgba(29,25,19,.62)", marginTop: 16 }}>
              ABOUT {listing.unparsedAddress.toUpperCase()} — TAP TO ASK
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 9 }}>
              {QUICK.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={q === s}
                  onClick={() => {
                    setQ(s);
                    setErr(null);
                  }}
                  style={{
                    border: q === s ? "1.5px solid #D9481F" : "1.5px solid #1D1913",
                    borderRadius: 999,
                    padding: "11px 14px",
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
              aria-label="Or ask it your way…"
              aria-invalid={!!err}
              aria-describedby={err ? "question-error" : undefined}
              rows={3}
              style={{ ...input, marginTop: 13, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {(["text", "email"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={pref === p}
                  onClick={() => setPref(p)}
                  className="font-mono"
                  style={{
                    flex: 1,
                    border: "1.5px solid #1D1913",
                    borderRadius: 999,
                    padding: "12px 0",
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
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); setErr(null); }}
                placeholder="Your name"
                aria-label="Your name"
                aria-invalid={!!err}
                aria-describedby={err ? "question-error" : undefined}
                style={{ ...input, flex: 1 }}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErr(null); }}
                placeholder="Your email"
                aria-label="Your email"
                aria-invalid={!!err}
                aria-describedby={err ? "question-error" : undefined}
                style={{ ...input, flex: 1 }}
              />
            </div>
            {pref === "text" && (
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setErr(null); }}
                placeholder="The number to text you back at"
                aria-label="The number to text you back at"
                aria-invalid={!!err}
                aria-describedby={err ? "question-error" : undefined}
                style={{ ...input, marginTop: 8 }}
              />
            )}
            {/* honeypot — visually hidden, tabbed past, bots fill it anyway */}
            <input
              type="text"
              value={hp}
              onChange={(e) => setHp(e.target.value)}
              name="company"
              autoComplete="off"
              tabIndex={-1}
              aria-hidden="true"
              style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
            />
            {err && (
              <div id="question-error" role="alert" className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".1em", color: "#C13E17", marginTop: 8 }}>
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
              style={{ textAlign: "center", fontSize: 8, letterSpacing: ".16em", color: "rgba(29,25,19,.62)", marginTop: 12 }}
            >
              YOUR INFO GOES TO ONE GUIDE — NEVER A LEAD LIST
            </div>
          </>
        )}
      </div>
    </div>
  );
}
