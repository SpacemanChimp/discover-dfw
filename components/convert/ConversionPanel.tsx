"use client";
/* The shared engine behind the seven contextual conversion panels. One
   inline card in the field-guide language — never a popup, takeover, or
   registration wall.

   - progressive two-step form: name / email-or-mobile / primary request,
     then an OPTIONAL details step (budget, timeline, comparison, note)
   - page context (URL + query with utm_*, referrer, session id, city,
     community) rides along automatically into the normalized lead intake
   - progressive enhancement: this is a REAL <form> posting to /api/leads —
     without JavaScript the route accepts the form encoding, derives page
     context from the Referer header, and redirects back
   - fully keyboard operable; visible labels; inline validation tied via
     aria-describedby; loading / success / error states announced via
     aria-live; step reveal stilled under prefers-reduced-motion (.cv-step)
   - collects nothing beyond the fields shown; no analytics calls */
import { useRef, useState } from "react";
import {
  INTENTS,
  TIMELINE_OPTIONS,
  buildLeadBody,
  validateStep1,
  type IntentKey,
  type Step1Values,
} from "@/lib/convert/intents";
import { getSessionId } from "@/lib/session-id";

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const ORANGE = "#D9481F";
const ORANGE_A11Y = "#C13E17";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: ".2em",
  color: "rgba(29,25,19,.62)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "13px 14px",
  borderRadius: 12,
  border: "1.5px solid rgba(29,25,19,.45)",
  background: CREAM,
  color: INK,
  fontFamily: "var(--font-archivo),sans-serif",
  fontSize: 15,
};

const hintStyle: React.CSSProperties = {
  marginTop: 5,
  fontSize: 9,
  letterSpacing: ".12em",
  color: "rgba(29,25,19,.5)",
};

const errStyle: React.CSSProperties = {
  marginTop: 5,
  fontSize: 9.5,
  letterSpacing: ".08em",
  fontWeight: 700,
  color: ORANGE_A11Y,
};

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={id} className="font-mono" style={labelStyle}>
        {label}
      </label>
      {children}
      {error ? (
        <div id={`${id}-err`} role="alert" className="font-mono" style={errStyle}>
          {error.toUpperCase()}
        </div>
      ) : hint ? (
        <div id={`${id}-hint`} className="font-mono" style={hintStyle}>
          {hint.toUpperCase()}
        </div>
      ) : null}
    </div>
  );
}

export default function ConversionPanel({
  intent,
  citySlug,
  community,
}: {
  intent: IntentKey;
  /** page context — the embedding template passes what it knows */
  citySlug?: string | null;
  community?: string | null;
}) {
  const cfg = INTENTS[intent];
  const uid = `cv-${intent}`;
  const [step, setStep] = useState<1 | 2>(1);
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [values, setValues] = useState<Step1Values>({ name: "", contact: "", primary: "" });
  const [details, setDetails] = useState({ budget: "", timeline: "", compareCity: "", message: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Step1Values, string>>>({});
  const [netError, setNetError] = useState<string | null>(null);
  const [hp, setHp] = useState("");
  const [openedAt] = useState(() => Date.now());
  const step2Ref = useRef<HTMLFieldSetElement>(null);

  const set = (k: keyof Step1Values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  function toStep2(e: React.MouseEvent) {
    e.preventDefault();
    const errs = validateStep1(values);
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = (["name", "contact", "primary"] as const).find((k) => errs[k]);
      if (first) document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }
    setStep(2);
    // focus lands on the first optional field once it exists
    requestAnimationFrame(() => step2Ref.current?.querySelector<HTMLElement>("input,select,textarea")?.focus());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateStep1(values);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setStep(1);
      return;
    }
    setPhase("sending");
    setNetError(null);
    const body = buildLeadBody(
      intent,
      values,
      details,
      {
        sourcePage: window.location.pathname + window.location.search,
        referrer: document.referrer || null,
        sessionId: getSessionId(),
        citySlug,
        community,
      },
      { hp, openedAt }
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
      setPhase("sent");
    } catch {
      setNetError("That didn't go through — try once more.");
      setPhase("idle");
    }
  }

  if (phase === "sent") {
    return (
      <aside
        aria-label={cfg.kicker}
        style={{ border: `2px solid ${INK}`, borderRadius: 18, background: "#FBF7EE", padding: "26px 24px" }}
      >
        <div role="status" className="cv-step">
          <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".28em", color: ORANGE_A11Y }}>
            {cfg.kicker} · RECEIVED
          </div>
          <p className="font-serif" style={{ margin: "12px 0 0", fontStyle: "italic", fontSize: 19, lineHeight: 1.5 }}>
            {cfg.success} ✳
          </p>
          <div className="font-mono" style={{ marginTop: 14, fontSize: 9, letterSpacing: ".2em", color: "rgba(29,25,19,.5)" }}>
            NO SPAM · NO OBLIGATION · A HUMAN REPLIES
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label={cfg.kicker}
      style={{ border: `2px solid ${INK}`, borderRadius: 18, background: "#FBF7EE", padding: "26px 24px" }}
    >
      <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".28em", color: ORANGE_A11Y }}>
        {cfg.kicker}
      </div>
      <h3 className="font-serif" style={{ margin: "10px 0 0", fontWeight: 800, fontSize: "clamp(21px,2.4vw,26px)", lineHeight: 1.15 }}>
        {cfg.headline}
      </h3>
      <p style={{ margin: "10px 0 18px", fontSize: 14.5, lineHeight: 1.65, color: "rgba(29,25,19,.78)" }}>{cfg.body}</p>

      {/* Real form — works without JS: the route accepts form encoding and
          falls back to the Referer header for page context. */}
      <form action="/api/leads" method="post" onSubmit={submit} noValidate>
        <input type="hidden" name="type" value="guide" />
        <input type="hidden" name="intent" value={intent} />
        {citySlug && <input type="hidden" name="citySlug" value={citySlug} />}
        {community && <input type="hidden" name="community" value={community} />}
        {/* honeypot — off-screen, tab-skipped */}
        <input
          value={hp}
          onChange={(e) => setHp(e.target.value)}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
        />

        <fieldset style={{ border: 0, padding: 0, margin: 0 }} disabled={phase === "sending"}>
          <legend className="cv-visually-hidden">Your request</legend>
          <Field id={`${uid}-name`} label="NAME" error={errors.name}>
            <input
              id={`${uid}-name`}
              name="name"
              type="text"
              autoComplete="name"
              value={values.name}
              onChange={set("name")}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? `${uid}-name-err` : undefined}
              style={inputStyle}
            />
          </Field>
          <Field id={`${uid}-contact`} label="EMAIL OR MOBILE" error={errors.contact}>
            <input
              id={`${uid}-contact`}
              name="contact"
              type="text"
              inputMode="email"
              autoComplete="email"
              value={values.contact}
              onChange={set("contact")}
              aria-invalid={!!errors.contact}
              aria-describedby={errors.contact ? `${uid}-contact-err` : undefined}
              style={inputStyle}
            />
          </Field>
          <Field id={`${uid}-primary`} label={cfg.primaryLabel.toUpperCase()} hint={cfg.primaryHint} error={errors.primary}>
            <input
              id={`${uid}-primary`}
              name="primary"
              type="text"
              value={values.primary}
              onChange={set("primary")}
              aria-invalid={!!errors.primary}
              aria-describedby={errors.primary ? `${uid}-primary-err` : `${uid}-primary-hint`}
              style={inputStyle}
            />
          </Field>
        </fieldset>

        {step === 2 && (
          <fieldset ref={step2Ref} className="cv-step" style={{ border: 0, padding: 0, margin: 0 }} disabled={phase === "sending"}>
            <legend className="font-mono" style={{ ...labelStyle, marginBottom: 12, color: ORANGE_A11Y }}>
              OPTIONAL DETAILS — SKIP FREELY
            </legend>
            {cfg.step2.compareCity && (
              <Field id={`${uid}-compare`} label="COMPARING WITH" hint="another city or community">
                <input
                  id={`${uid}-compare`}
                  name="comparingWith"
                  type="text"
                  value={details.compareCity}
                  onChange={(e) => setDetails((d) => ({ ...d, compareCity: e.target.value }))}
                  aria-describedby={`${uid}-compare-hint`}
                  style={inputStyle}
                />
              </Field>
            )}
            {cfg.step2.budget && (
              <Field id={`${uid}-budget`} label="BUDGET" hint="a range is fine">
                <input
                  id={`${uid}-budget`}
                  name="budget"
                  type="text"
                  value={details.budget}
                  onChange={(e) => setDetails((d) => ({ ...d, budget: e.target.value }))}
                  aria-describedby={`${uid}-budget-hint`}
                  style={inputStyle}
                />
              </Field>
            )}
            {cfg.step2.timeline && (
              <Field id={`${uid}-timeline`} label="TIMELINE">
                <select
                  id={`${uid}-timeline`}
                  name="timeline"
                  value={details.timeline}
                  onChange={(e) => setDetails((d) => ({ ...d, timeline: e.target.value }))}
                  style={{ ...inputStyle, appearance: "auto" }}
                >
                  <option value="">Prefer not to say</option>
                  {TIMELINE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {cfg.step2.message && (
              <Field id={`${uid}-message`} label="ANYTHING ELSE">
                <textarea
                  id={`${uid}-message`}
                  name="message"
                  rows={3}
                  value={details.message}
                  onChange={(e) => setDetails((d) => ({ ...d, message: e.target.value }))}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </Field>
            )}
          </fieldset>
        )}

        {netError && (
          <div role="alert" className="font-mono" style={{ ...errStyle, marginBottom: 10 }}>
            {netError.toUpperCase()}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {step === 1 ? (
            <>
              <button type="button" className="btn-dark" onClick={toStep2} style={pillStyle(true)}>
                Continue →
              </button>
              <button type="submit" disabled={phase === "sending"} style={pillStyle(false)}>
                {phase === "sending" ? "Sending…" : "Skip details & send"}
              </button>
            </>
          ) : (
            <>
              <button type="submit" className="btn-dark" disabled={phase === "sending"} style={pillStyle(true)}>
                {phase === "sending" ? "Sending…" : "Send request"}
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={phase === "sending"}
                style={pillStyle(false)}
              >
                ← Back
              </button>
            </>
          )}
        </div>
        {/* loading/status announcements for screen readers */}
        <span aria-live="polite" className="cv-visually-hidden">
          {phase === "sending" ? "Sending your request." : ""}
        </span>
        <div className="font-mono" style={{ marginTop: 14, fontSize: 9, letterSpacing: ".2em", color: "rgba(29,25,19,.5)" }}>
          ANSWERED BY A LOCAL GUIDE · NEVER A LEAD LIST
        </div>
      </form>
    </aside>
  );
}

function pillStyle(primary: boolean): React.CSSProperties {
  return {
    background: primary ? INK : "transparent",
    color: primary ? CREAM : INK,
    border: `2px solid ${INK}`,
    borderRadius: 999,
    padding: "13px 24px",
    fontFamily: "var(--font-archivo),sans-serif",
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: ".03em",
    cursor: "pointer",
  };
}
