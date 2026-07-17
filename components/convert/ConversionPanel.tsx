"use client";
/* The seven contextual conversion asks. Each renders as a compact, designed
   TRIGGER CARD (kicker + headline + one line + a button) — never a raw form
   sitting in the page. Pressing the button opens the request FORM in a modal
   sheet (same bottom-sheet pattern as "Request a showing"), so the page reads
   clean and the form only appears on intent.

   - signed-in members are not asked to re-enter what we already have: the
     sheet prefills from the account and hides the name/contact fields (with
     an "edit" escape hatch); it only asks for details we don't hold
   - progressive: the required ask first, optional budget/timeline revealed
     on demand
   - page context (URL + utm_*, referrer, session, city, community) rides
     into the normalized intake; loading / success / validation / error
     states; keyboard-operable modal (focus trap, Esc, restore); collects
     nothing beyond what's shown; no analytics calls */
import { useEffect, useRef, useState } from "react";
import { INTENTS, TIMELINE_OPTIONS, buildLeadBody, validateStep1, type IntentKey } from "@/lib/convert/intents";
import { useShelf } from "@/lib/shelf";
import { getSessionId } from "@/lib/session-id";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import LeadSuccessState from "@/components/search/LeadSuccessState";

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const CARD = "#FBF7EE";
const ORANGE = "#D9481F";
const ORANGE_A11Y = "#C13E17";

/* ---------------- trigger card ---------------- */

export default function ConversionPanel({
  intent,
  citySlug,
  community,
  variant = "card",
}: {
  intent: IntentKey;
  citySlug?: string | null;
  community?: string | null;
  /** "card" — full designed trigger (city/hood/home pages); "pill" — a slim
      button for tight surfaces like the search rail. Both open the modal. */
  variant?: "card" | "pill";
}) {
  const cfg = INTENTS[intent];
  const [open, setOpen] = useState(false);
  const sheet = open && <ConversionSheet intent={intent} citySlug={citySlug} community={community} onClose={() => setOpen(false)} />;

  if (variant === "pill") {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="link-underline font-mono"
          style={{
            background: "none",
            border: `1.5px dashed rgba(217,72,31,.55)`,
            borderRadius: 999,
            padding: "11px 18px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: ".16em",
            color: ORANGE_A11Y,
            cursor: "pointer",
          }}
        >
          {cfg.kicker === "HUMAN SEARCH HELP" ? "TOO MANY RESULTS? GET HUMAN HELP" : cfg.cta.toUpperCase()} →
        </button>
        {sheet}
      </div>
    );
  }

  return (
    <aside
      aria-label={cfg.kicker}
      style={{
        border: `2px solid ${INK}`,
        borderRadius: 18,
        background: CARD,
        padding: "22px 24px",
        display: "flex",
        alignItems: "center",
        gap: 22,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1 1 300px", minWidth: 0 }}>
        <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".26em", color: ORANGE_A11Y }}>
          {cfg.kicker}
        </div>
        <h3 className="font-serif" style={{ margin: "8px 0 0", fontWeight: 800, fontSize: "clamp(19px,2.2vw,24px)", lineHeight: 1.15 }}>
          {cfg.headline}
        </h3>
        <p style={{ margin: "7px 0 0", fontSize: 14, lineHeight: 1.6, color: "rgba(29,25,19,.72)" }}>{cfg.body}</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-dark"
        style={{
          flexShrink: 0,
          background: INK,
          color: CREAM,
          border: `2px solid ${INK}`,
          borderRadius: 999,
          padding: "14px 26px",
          fontFamily: "var(--font-archivo),sans-serif",
          fontWeight: 700,
          fontSize: 14.5,
          letterSpacing: ".02em",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {cfg.cta} →
      </button>
      {sheet}
    </aside>
  );
}

/* ---------------- the form modal ---------------- */

const label: React.CSSProperties = {
  display: "block",
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: ".2em",
  color: "rgba(29,25,19,.62)",
  marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: `2px solid ${INK}`,
  borderRadius: 14,
  padding: "12px 15px",
  background: CARD,
  fontSize: 16, // ≥16px stops iOS Safari zooming the sheet on focus
  fontFamily: "inherit",
  color: INK,
  outline: "none",
};
const hint: React.CSSProperties = { marginTop: 5, fontSize: 9.5, letterSpacing: ".1em", color: "rgba(29,25,19,.5)" };
const errStyle: React.CSSProperties = { marginTop: 5, fontSize: 9.5, letterSpacing: ".08em", fontWeight: 700, color: ORANGE_A11Y };

function ConversionSheet({
  intent,
  citySlug,
  community,
  onClose,
}: {
  intent: IntentKey;
  citySlug?: string | null;
  community?: string | null;
  onClose: () => void;
}) {
  const cfg = INTENTS[intent];
  const uid = `cv-${intent}`;
  const shelf = useShelf();
  const account = shelf.account;
  // signed-in with a full identity → don't ask again (edit reveals the fields)
  const identityKnown = !!(account?.email && account?.name);
  const [editIdentity, setEditIdentity] = useState(false);
  const showIdentityFields = !identityKnown || editIdentity;

  const [name, setName] = useState(account?.name ?? "");
  const [contact, setContact] = useState(account?.email ?? "");
  const [primary, setPrimary] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [details, setDetails] = useState({ budget: "", timeline: "", compareCity: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [netError, setNetError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [hp, setHp] = useState("");
  const openedAt = useRef(Date.now());
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y({ open: true, onClose, panelRef });

  // account can hydrate a tick after mount — keep prefilled fields in step
  useEffect(() => {
    if (account?.name) setName((n) => n || account.name || "");
    if (account?.email) setContact((c) => c || account.email);
  }, [account]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // validate only the fields actually shown; a known account supplies the rest
    const errs: Record<string, string> = {};
    if (showIdentityFields) {
      const v = validateStep1({ name, contact, primary });
      Object.assign(errs, v);
    } else if (!primary.trim()) {
      errs.primary = "One line is enough — what should we work from?";
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = ["name", "contact", "primary"].find((k) => errs[k]);
      if (first) document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }
    setPhase("sending");
    setNetError(null);
    const body = buildLeadBody(
      intent,
      { name: name || account?.name || "", contact: contact || account?.email || "", primary },
      showDetails ? details : {},
      {
        sourcePage: window.location.pathname + window.location.search,
        referrer: document.referrer || null,
        sessionId: getSessionId(),
        citySlug,
        community,
      },
      { hp, openedAt: openedAt.current }
    );
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setNetError(data.error ?? "That didn't go through — try once more.");
        setPhase("idle");
        return;
      }
      setPhase("sent"); // only a confirmed backend success flips to done
    } catch {
      setNetError("That didn't go through — try once more.");
      setPhase("idle");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={cfg.kicker}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(29,25,19,.55)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: CREAM,
          borderTop: `2px solid ${INK}`,
          borderRadius: "24px 24px 0 0",
          padding: "14px 20px 32px",
          boxShadow: "0 -18px 44px rgba(20,16,10,.35)",
          maxWidth: 560,
          width: "100%",
          margin: "0 auto",
          maxHeight: "90vh",
          overflowY: "auto",
          animation: "fadeUp .3s ease both",
          outline: "none",
        }}
      >
        <div style={{ width: 44, height: 5, borderRadius: 99, background: "rgba(29,25,19,.25)", margin: "0 auto" }} />
        {phase === "sent" ? (
          <LeadSuccessState eyebrow={`${cfg.kicker} · RECEIVED`} headline="Consider it in motion." body={cfg.success} onClose={onClose} />
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".26em", color: ORANGE_A11Y, marginTop: 16 }}>
              {cfg.kicker}
            </div>
            <div className="font-serif" style={{ fontWeight: 900, fontSize: 24, marginTop: 6 }}>
              {cfg.headline}
            </div>
            <p style={{ margin: "8px 0 18px", fontSize: 14, lineHeight: 1.6, color: "rgba(29,25,19,.72)" }}>{cfg.body}</p>

            {/* honeypot */}
            <input value={hp} onChange={(e) => setHp(e.target.value)} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

            {/* identity — hidden entirely for signed-in members */}
            {showIdentityFields ? (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor={`${uid}-name`} className="font-mono" style={label}>NAME</label>
                  <input id={`${uid}-name`} type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? `${uid}-name-err` : undefined} style={input} />
                  {errors.name && <div id={`${uid}-name-err`} role="alert" className="font-mono" style={errStyle}>{errors.name.toUpperCase()}</div>}
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor={`${uid}-contact`} className="font-mono" style={label}>EMAIL OR MOBILE</label>
                  <input id={`${uid}-contact`} type="text" inputMode="email" autoComplete="email" value={contact} onChange={(e) => setContact(e.target.value)} aria-invalid={!!errors.contact} aria-describedby={errors.contact ? `${uid}-contact-err` : undefined} style={input} />
                  {errors.contact && <div id={`${uid}-contact-err`} role="alert" className="font-mono" style={errStyle}>{errors.contact.toUpperCase()}</div>}
                </div>
              </>
            ) : (
              <div className="font-mono" style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", fontSize: 10, letterSpacing: ".08em", color: "rgba(29,25,19,.6)", marginBottom: 14 }}>
                <span>SENDING AS {(account?.name || "").toUpperCase()} · {(account?.email || "").toUpperCase()}</span>
                <button type="button" onClick={() => setEditIdentity(true)} className="link-underline" style={{ background: "none", border: "none", padding: 4, color: ORANGE_A11Y, fontWeight: 700, letterSpacing: ".08em", cursor: "pointer", fontFamily: "inherit" }}>
                  NOT YOU? EDIT
                </button>
              </div>
            )}

            {/* the one required ask */}
            <div style={{ marginBottom: 14 }}>
              <label htmlFor={`${uid}-primary`} className="font-mono" style={label}>{cfg.primaryLabel.toUpperCase()}</label>
              <input id={`${uid}-primary`} type="text" value={primary} onChange={(e) => setPrimary(e.target.value)} aria-invalid={!!errors.primary} aria-describedby={errors.primary ? `${uid}-primary-err` : `${uid}-primary-hint`} style={input} />
              {errors.primary ? (
                <div id={`${uid}-primary-err`} role="alert" className="font-mono" style={errStyle}>{errors.primary.toUpperCase()}</div>
              ) : (
                <div id={`${uid}-primary-hint`} className="font-mono" style={hint}>{cfg.primaryHint.toUpperCase()}</div>
              )}
            </div>

            {/* optional details — revealed on demand */}
            {!showDetails ? (
              <button type="button" onClick={() => setShowDetails(true)} className="link-underline font-mono" style={{ background: "none", border: "none", padding: "4px 0 10px", color: ORANGE_A11Y, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", cursor: "pointer" }}>
                + ADD BUDGET, TIMELINE &amp; MORE (OPTIONAL)
              </button>
            ) : (
              <fieldset className="cv-step" style={{ border: 0, padding: 0, margin: "0 0 6px" }}>
                <legend className="font-mono" style={{ ...label, marginBottom: 12, color: ORANGE_A11Y }}>OPTIONAL DETAILS — SKIP FREELY</legend>
                {cfg.step2.compareCity && (
                  <div style={{ marginBottom: 12 }}>
                    <label htmlFor={`${uid}-compare`} className="font-mono" style={label}>COMPARING WITH</label>
                    <input id={`${uid}-compare`} type="text" value={details.compareCity} onChange={(e) => setDetails((d) => ({ ...d, compareCity: e.target.value }))} style={input} />
                  </div>
                )}
                {cfg.step2.budget && (
                  <div style={{ marginBottom: 12 }}>
                    <label htmlFor={`${uid}-budget`} className="font-mono" style={label}>BUDGET</label>
                    <input id={`${uid}-budget`} type="text" value={details.budget} onChange={(e) => setDetails((d) => ({ ...d, budget: e.target.value }))} style={input} />
                  </div>
                )}
                {cfg.step2.timeline && (
                  <div style={{ marginBottom: 12 }}>
                    <label htmlFor={`${uid}-timeline`} className="font-mono" style={label}>TIMELINE</label>
                    <select id={`${uid}-timeline`} value={details.timeline} onChange={(e) => setDetails((d) => ({ ...d, timeline: e.target.value }))} style={{ ...input, appearance: "auto" }}>
                      <option value="">Prefer not to say</option>
                      {TIMELINE_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                )}
                {cfg.step2.message && (
                  <div style={{ marginBottom: 12 }}>
                    <label htmlFor={`${uid}-message`} className="font-mono" style={label}>ANYTHING ELSE</label>
                    <textarea id={`${uid}-message`} rows={3} value={details.message} onChange={(e) => setDetails((d) => ({ ...d, message: e.target.value }))} style={{ ...input, resize: "vertical" }} />
                  </div>
                )}
              </fieldset>
            )}

            {netError && <div role="alert" className="font-mono" style={{ ...errStyle, marginBottom: 10 }}>{netError.toUpperCase()}</div>}

            <button
              type="submit"
              disabled={phase === "sending"}
              className="btn-dark"
              style={{ width: "100%", boxSizing: "border-box", background: ORANGE, color: CREAM, border: `2px solid ${ORANGE}`, borderRadius: 999, padding: "15px", marginTop: 6, fontFamily: "inherit", fontWeight: 700, fontSize: 15, letterSpacing: ".02em", cursor: phase === "sending" ? "wait" : "pointer", opacity: phase === "sending" ? 0.7 : 1 }}
            >
              {phase === "sending" ? "Sending…" : cfg.cta}
            </button>
            <span aria-live="polite" className="cv-visually-hidden">{phase === "sending" ? "Sending your request." : ""}</span>
            <div className="font-mono" style={{ marginTop: 12, fontSize: 9, letterSpacing: ".18em", color: "rgba(29,25,19,.5)", textAlign: "center" }}>
              ANSWERED BY A LOCAL GUIDE · NEVER A LEAD LIST
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
