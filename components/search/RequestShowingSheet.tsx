"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Listing } from "@/lib/mls/types";
import { useShelf } from "@/lib/shelf";
import { getSessionId } from "@/lib/session-id";
import LeadSuccessState from "./LeadSuccessState";

const chip = (active: boolean): React.CSSProperties => ({
  flex: 1,
  border: active ? "1.5px solid #1D1913" : "1.5px solid #1D1913",
  borderRadius: 999,
  padding: "9px 0",
  textAlign: "center",
  fontSize: 8.5,
  fontWeight: active ? 700 : 400,
  letterSpacing: ".12em",
  background: active ? "#1D1913" : "#FBF7EE",
  color: active ? "#F6F1E6" : "#1D1913",
  cursor: "pointer",
});

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

export default function RequestShowingSheet({
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
  const days = useMemo(() => {
    const out: { key: string; dow: string; dom: number }[] = [];
    const d = new Date();
    for (let i = 1; i <= 4; i++) {
      const day = new Date(d);
      day.setDate(d.getDate() + i);
      out.push({
        key: day.toISOString().slice(0, 10),
        dow: day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
        dom: day.getDate(),
      });
    }
    return out;
  }, []);

  const shelf = useShelf();
  const [day, setDay] = useState(1);
  const [time, setTime] = useState("Midday");
  const [mode, setMode] = useState("In person");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [hp, setHp] = useState(""); // honeypot — humans never see it
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const openedAt = useRef(Date.now());

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
    if (!name.trim()) {
      setErr("Add your name so the guide knows who's coming.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr("Add an email so your guide can confirm.");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/showing-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingKey: listing.listingKey,
          citySlug: listing.citySlug,
          address: `${listing.unparsedAddress}, ${cityName}`,
          requestedDay: days[day].key,
          timeWindow: time,
          mode: mode === "Live video" ? "live_video" : "in_person",
          name,
          email,
          phone,
          message: note,
          sourcePage: window.location.pathname,
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
      aria-label="Request a showing"
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
          <LeadSuccessState
            eyebrow="REQUEST SENT"
            headline="Consider it requested."
            body={`A local guide will confirm. You asked for ${days[day].dow} ${days[day].dom}, ${time.toLowerCase()} — expect a reply within the hour, never a call center.`}
            onClose={onClose}
          />
        ) : (
          <>
            <div className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".26em", color: "#D9481F", marginTop: 16 }}>
              SEE IT IN PERSON
            </div>
            <div className="font-serif" style={{ fontWeight: 900, fontSize: 24, marginTop: 6 }}>
              {listing.unparsedAddress}, {cityName}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {days.map((d, i) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDay(i)}
                  style={{
                    flex: 1,
                    border: `2px solid ${i === day ? "#D9481F" : "#1D1913"}`,
                    borderRadius: 12,
                    padding: "10px 0",
                    textAlign: "center",
                    background: i === day ? "#D9481F" : "#FBF7EE",
                    color: i === day ? "#F6F1E6" : "#1D1913",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <span className="font-mono" style={{ fontSize: 7.5, letterSpacing: ".14em", opacity: 0.7 }}>
                    {d.dow}
                  </span>
                  <br />
                  <b className="font-serif" style={{ fontSize: 17 }}>{d.dom}</b>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {["Morning", "Midday", "Evening"].map((t) => (
                <button key={t} type="button" onClick={() => setTime(t)} className="font-mono" style={chip(time === t)}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, borderTop: "1px solid rgba(29,25,19,.16)", paddingTop: 14 }}>
              {["In person", "Live video"].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1,
                    border: "2px solid #1D1913",
                    borderRadius: 999,
                    padding: "10px 0",
                    textAlign: "center",
                    fontSize: 12.5,
                    fontWeight: 700,
                    background: mode === m ? "#1D1913" : "#FBF7EE",
                    color: mode === m ? "#F6F1E6" : "#1D1913",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {m === "In person" ? "⌂ In person" : "▶ Live video"}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} placeholder="Your name" style={{ ...input, flex: 1 }} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" style={{ ...input, flex: 1 }} />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErr(null); }}
              placeholder="Email"
              style={{ ...input, marginTop: 8 }}
            />
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
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything we should know? (optional)"
              rows={2}
              style={{ ...input, marginTop: 8, resize: "vertical" }}
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
                marginTop: 14,
                border: "2px solid #D9481F",
                cursor: state === "sending" ? "wait" : "pointer",
                fontFamily: "inherit",
                opacity: state === "sending" ? 0.7 : 1,
              }}
            >
              {state === "sending" ? "Sending…" : "Request this showing"}
            </button>
            <div
              className="font-mono"
              style={{ textAlign: "center", fontSize: 8, letterSpacing: ".16em", color: "rgba(29,25,19,.5)", marginTop: 12 }}
            >
              A LOCAL GUIDE CONFIRMS WITHIN THE HOUR — NEVER A CALL CENTER
            </div>
          </>
        )}
      </div>
    </div>
  );
}
