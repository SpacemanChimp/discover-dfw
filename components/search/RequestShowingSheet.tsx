"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/analytics/track";
import type { Listing } from "@/lib/mls/types";
import { useShelf } from "@/lib/shelf";
import { getSessionId } from "@/lib/session-id";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import {
  quickDates,
  chicagoTodayISO,
  addDaysISO,
  friendlyLabel,
  validateRequestedDay,
  SHOWING_MAX_DAYS,
} from "@/lib/showing/dates";
import LeadSuccessState from "./LeadSuccessState";

const chip = (active: boolean): React.CSSProperties => ({
  flex: 1,
  border: "1.5px solid #1D1913",
  borderRadius: 999,
  padding: "13px 0",
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
  fontSize: 16, // ≥16px keeps iOS Safari from zooming the sheet on focus
  fontFamily: "inherit",
  color: "#1D1913",
  outline: "none",
};

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: ".2em",
  color: "rgba(29,25,19,.62)",
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
  // Chicago-anchored: recomputed each open so "tomorrow" is never stale
  const quick = useMemo(() => quickDates(), [open]);
  const today = useMemo(() => chicagoTodayISO(), [open]);
  const maxDate = useMemo(() => addDaysISO(today, SHOWING_MAX_DAYS), [today]);

  const shelf = useShelf();
  // the chosen calendar date is the single source of truth
  const [selectedIso, setSelectedIso] = useState(quick[0].iso);
  const [dateSource, setDateSource] = useState<"quick" | "calendar">("quick");
  const [showCal, setShowCal] = useState(false);
  const [customIso, setCustomIso] = useState(""); // native <input type=date> value
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
  const panelRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  useDialogA11y({ open, onClose, panelRef });

  // each open: fresh spam clock + prefill from the signed-in account. The
  // selected date persists in state across validation errors/steps by design.
  useEffect(() => {
    if (!open) return;
    openedAt.current = Date.now();
    setSelectedIso((cur) => cur || quick[0].iso);
    if (shelf.account) {
      setName((n) => n || shelf.account?.name || "");
      setEmail((e) => e || shelf.account?.email || "");
    }
  }, [open, shelf.account, quick]);

  // reveal → focus the native picker so keyboard/SR users land on it
  useEffect(() => {
    if (showCal) dateInputRef.current?.focus();
  }, [showCal]);

  if (!open) return null;

  function pickQuick(iso: string) {
    setSelectedIso(iso);
    setDateSource("quick");
    setErr(null);
  }

  function onCustomChange(v: string) {
    if (!v) return; // cleared — keep the prior selection
    const check = validateRequestedDay(v, today);
    if (!check.ok) {
      setErr(check.reason === "past" ? "That date has passed — pick another." : `Pick a date within the next ${SHOWING_MAX_DAYS} days.`);
      return;
    }
    setCustomIso(v);
    setSelectedIso(v);
    setDateSource("calendar");
    setErr(null);
  }

  const submit = async () => {
    if (!name.trim()) {
      setErr("Add your name so the guide knows who's coming.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr("Add an email so your guide can confirm.");
      return;
    }
    const dateCheck = validateRequestedDay(selectedIso, today);
    if (!dateCheck.ok) {
      setErr("Pick a valid showing date.");
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
          community: listing.neighborhood || undefined,
          address: `${listing.unparsedAddress}, ${cityName}`,
          requestedDay: selectedIso, // unambiguous YYYY-MM-DD
          timeWindow: time,
          mode: mode === "Live video" ? "live_video" : "in_person",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
          dateSource, // "quick" | "calendar"
          name,
          email,
          phone,
          message: note,
          sourcePage: window.location.pathname + window.location.search, // carries utm_*
          referrer: document.referrer || undefined,
          sessionId: getSessionId(),
          hp,
          openedAt: openedAt.current,
        }),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; leadId?: string };
      if (!res.ok || !data.ok) throw new Error();
      track("showing_requested", { intent: "schedule-showing", leadId: data.leadId });
      setState("sent");
    } catch {
      setState("error");
      setErr("That didn’t go through — try once more.");
    }
  };

  const calBtnActive = dateSource === "calendar";

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
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="lead-sheet"
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
          outline: "none",
        }}
      >
        <div style={{ width: 44, height: 5, borderRadius: 99, background: "rgba(29,25,19,.25)", margin: "0 auto" }} />
        {state === "sent" ? (
          <LeadSuccessState
            eyebrow="REQUEST SENT"
            headline="Consider it requested."
            body={`You asked to see it ${friendlyLabel(selectedIso, today).replace("Tomorrow · ", "")}, ${time.toLowerCase()}. This is a request, not a confirmed time — we’ll confirm the exact time with you and the listing agent, usually within the hour.`}
            onClose={onClose}
          />
        ) : (
          <>
            <div className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".26em", color: "#C13E17", marginTop: 16 }}>
              SEE IT IN PERSON
            </div>
            <div className="font-serif" style={{ fontWeight: 900, fontSize: 24, marginTop: 6 }}>
              {listing.unparsedAddress}, {cityName}
            </div>

            <fieldset style={{ border: 0, padding: 0, margin: "16px 0 0", minWidth: 0 }}>
              <legend className="font-mono" style={{ ...fieldLabel, marginBottom: 8 }}>PICK A DAY</legend>
              <div style={{ display: "flex", gap: 8 }}>
                {quick.map((q) => {
                  const active = dateSource === "quick" && selectedIso === q.iso;
                  return (
                    <button
                      key={q.iso}
                      type="button"
                      aria-pressed={active}
                      aria-label={q.label.replace(" · ", ", ")}
                      onClick={() => pickQuick(q.iso)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        border: `2px solid ${active ? "#D9481F" : "#1D1913"}`,
                        borderRadius: 12,
                        padding: "11px 4px",
                        textAlign: "center",
                        background: active ? "#D9481F" : "#FBF7EE",
                        color: active ? "#F6F1E6" : "#1D1913",
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      <span className="font-mono" style={{ fontSize: 7.5, letterSpacing: ".12em", opacity: 0.75, display: "block" }}>
                        {q.eyebrow}
                      </span>
                      <b className="font-serif" style={{ fontSize: 15.5, whiteSpace: "nowrap" }}>{q.dateLine}</b>
                    </button>
                  );
                })}
              </div>

              {/* fourth option — opens the native calendar picker inline */}
              <button
                type="button"
                aria-pressed={calBtnActive}
                aria-expanded={showCal}
                aria-controls="showing-date-field"
                onClick={() => setShowCal(true)}
                className="font-mono"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  marginTop: 8,
                  border: `2px ${calBtnActive ? "solid #D9481F" : "dashed rgba(29,25,19,.55)"}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                  textAlign: "center",
                  background: calBtnActive ? "#D9481F" : "#FBF7EE",
                  color: calBtnActive ? "#F6F1E6" : "#1D1913",
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: ".1em",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {calBtnActive && customIso ? `📅 ${friendlyLabel(customIso, today).toUpperCase()}` : "CHOOSE ANOTHER DATE"}
              </button>

              {showCal && (
                <div id="showing-date-field" style={{ marginTop: 10 }}>
                  <label htmlFor="showing-date" className="font-mono" style={{ ...fieldLabel, marginBottom: 6 }}>
                    ANY DATE WITHIN {SHOWING_MAX_DAYS} DAYS
                  </label>
                  <input
                    id="showing-date"
                    ref={dateInputRef}
                    type="date"
                    className="showing-date-input"
                    value={customIso}
                    min={today}
                    max={maxDate}
                    onChange={(e) => onCustomChange(e.target.value)}
                    style={input}
                  />
                </div>
              )}

              <p style={{ margin: "10px 0 0", fontSize: 11.5, lineHeight: 1.5, color: "rgba(29,25,19,.66)" }}>
                We’ll confirm the exact time with you and the listing agent.
              </p>
            </fieldset>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }} role="group" aria-label="Time of day">
              {["Morning", "Midday", "Evening"].map((t) => (
                <button key={t} type="button" aria-pressed={time === t} onClick={() => setTime(t)} className="font-mono" style={chip(time === t)}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, borderTop: "1px solid rgba(29,25,19,.16)", paddingTop: 14 }} role="group" aria-label="How you'd like to tour">
              {["In person", "Live video"].map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1,
                    border: "2px solid #1D1913",
                    borderRadius: 999,
                    padding: "12px 0",
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
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); setErr(null); }}
                placeholder="Your name"
                aria-label="Your name"
                aria-invalid={!!err}
                aria-describedby={err ? "showing-error" : undefined}
                style={{ ...input, flex: 1 }}
              />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" aria-label="Phone (optional)" style={{ ...input, flex: 1 }} />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErr(null); }}
              placeholder="Email"
              aria-label="Email"
              aria-invalid={!!err}
              aria-describedby={err ? "showing-error" : undefined}
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
              aria-label="Anything we should know? (optional)"
              rows={2}
              style={{ ...input, marginTop: 8, resize: "vertical" }}
            />
            {err && (
              <div id="showing-error" role="alert" className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".1em", color: "#C13E17", marginTop: 8 }}>
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
              style={{ textAlign: "center", fontSize: 8, letterSpacing: ".16em", color: "rgba(29,25,19,.62)", marginTop: 12 }}
            >
              A LOCAL GUIDE CONFIRMS THE TIME — NEVER A CALL CENTER
            </div>
          </>
        )}
      </div>
    </div>
  );
}
