"use client";
import { useState } from "react";

/* The Letter signup (TL-1) — real double opt-in: this form only ever
   creates a PENDING subscriber and triggers the confirmation email; the
   link in that email is what actually subscribes. Carries the same cheap
   spam guard as the lead forms (hidden honeypot + submit dwell time). */

export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState(""); // honeypot — humans never see it
  const [openedAt] = useState(() => Date.now());
  const [phase, setPhase] = useState<"idle" | "sending" | "confirm_sent" | "already">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/letter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, hp, openedAt }),
      });
      const data = (await res.json()) as { ok: boolean; state?: string; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Something hiccuped — try again.");
        setPhase("idle");
        return;
      }
      setPhase(data.state === "already" ? "already" : "confirm_sent");
    } catch {
      setError("Something hiccuped — try again.");
      setPhase("idle");
    }
  }

  return (
    <section
      id="newsletter"
      style={{ background: "#D9481F", borderTop: "2px solid #1D1913" }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "88px 4vw", textAlign: "center" }}>
        <div data-reveal="1">
          <div
            className="font-mono"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".32em",
              color: "rgba(246,241,230,.8)",
              marginBottom: 16,
            }}
          >
            05 — THE NEWSLETTER
          </div>
          <h2
            className="font-serif"
            style={{
              margin: 0,
              fontWeight: 900,
              fontSize: "clamp(32px,4.4vw,54px)",
              lineHeight: 1.08,
              color: "#F6F1E6",
            }}
          >
            The Sunday letter that knows North Texas.
          </h2>
          <p
            style={{
              margin: "16px auto 30px",
              maxWidth: 520,
              fontSize: 15.5,
              lineHeight: 1.65,
              color: "rgba(246,241,230,.9)",
            }}
          >
            One email a week: what listed, what sold, and which city just changed
            its math. No spam, no listings-blast.
          </p>

          {phase === "confirm_sent" ? (
            <div
              className="font-serif"
              style={{ fontStyle: "italic", fontSize: 24, color: "#F6F1E6" }}
              role="status"
            >
              Check your inbox — one click there and you&apos;re in. ✳
            </div>
          ) : phase === "already" ? (
            <div
              className="font-serif"
              style={{ fontStyle: "italic", fontSize: 24, color: "#F6F1E6" }}
              role="status"
            >
              You&apos;re already on the list — see you Sunday. ✳
            </div>
          ) : (
            <form
              onSubmit={submit}
              style={{
                display: "flex",
                gap: 12,
                maxWidth: 520,
                margin: "0 auto",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              {/* honeypot — off-screen, tab-skipped, autocomplete-proof */}
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
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                placeholder="you@northtexas.com"
                aria-label="Email address"
                style={{
                  flex: 1,
                  minWidth: 240,
                  padding: "16px 22px",
                  borderRadius: 999,
                  border: "2px solid #1D1913",
                  background: "#F6F1E6",
                  color: "#1D1913",
                  fontFamily: "var(--font-archivo),sans-serif",
                  fontSize: 15,
                  outline: "none",
                }}
              />
              <button
                type="submit"
                className="btn-dark"
                disabled={phase === "sending"}
                style={{
                  background: "#1D1913",
                  color: "#F6F1E6",
                  border: "2px solid #1D1913",
                  borderRadius: 999,
                  padding: "16px 30px",
                  fontFamily: "var(--font-archivo),sans-serif",
                  fontWeight: 700,
                  fontSize: 15,
                  letterSpacing: ".03em",
                  cursor: phase === "sending" ? "wait" : "pointer",
                  opacity: phase === "sending" ? 0.7 : 1,
                }}
              >
                {phase === "sending" ? "Sending…" : "Sign me up"}
              </button>
            </form>
          )}

          {error && (
            <div
              role="alert"
              className="font-mono"
              style={{ marginTop: 14, fontSize: 12, letterSpacing: ".08em", color: "#F6F1E6" }}
            >
              {error.toUpperCase()}
            </div>
          )}

          <div
            className="font-mono"
            style={{
              marginTop: 18,
              fontSize: 10,
              letterSpacing: ".22em",
              color: "rgba(246,241,230,.7)",
            }}
          >
            FREE · WEEKLY · CONFIRMED BY EMAIL · UNSUBSCRIBE ANYTIME
          </div>
        </div>
      </div>
    </section>
  );
}
