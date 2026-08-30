"use client";
import { useState } from "react";
import { track } from "@/lib/analytics/track";
import { useLetterFormView } from "@/components/analytics/useLetterFormView";

/* Inline signup for The Letter — the plain-benefit version of the big
   bottom section, placed after the first major useful homepage section.
   Same endpoint, same double opt-in, same honeypot; success and error
   states are explicit; the email address never reaches analytics.
   Reusable anywhere, but keep instances far apart (one inline + the
   bottom section is the intended maximum per page). */
export default function LetterInline() {
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [openedAt] = useState(() => Date.now());
  const [phase, setPhase] = useState<"idle" | "sending" | "confirm_sent" | "already">("idle");
  const [error, setError] = useState<string | null>(null);
  const viewRef = useLetterFormView("newsletter-inline");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPhase("sending");
    setError(null);
    track("letter_signup_started", { intent: "newsletter" });
    try {
      const res = await fetch("/api/letter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, hp, openedAt }),
      });
      const data = (await res.json()) as { ok: boolean; state?: string; error?: string };
      if (!data.ok) {
        track("newsletter_error", { intent: "newsletter" });
        setError(data.error ?? "Something hiccuped. Try again.");
        setPhase("idle");
        return;
      }
      setPhase(data.state === "already" ? "already" : "confirm_sent");
    } catch {
      track("newsletter_error", { intent: "newsletter" });
      setError("Something hiccuped. Try again.");
      setPhase("idle");
    }
  }

  return (
    <section
      aria-label="The Letter, weekly market email"
      ref={viewRef as React.RefObject<HTMLElement>}
      style={{ borderTop: "1px solid rgba(29,25,19,.16)", background: "#F6F1E6", color: "#1D1913" }}
    >
      <div
        style={{
          maxWidth: 1380,
          margin: "0 auto",
          padding: "30px 4vw 34px",
          display: "flex",
          gap: "18px 40px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 460px", minWidth: 0 }}>
          <div className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".24em", color: "#C13E17" }}>
            THE LETTER — FREE EVERY SUNDAY
          </div>
          <div className="font-serif" style={{ fontWeight: 800, fontSize: 21, marginTop: 6, lineHeight: 1.2 }}>
            One weekly email on what actually changed in DFW.
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "rgba(29,25,19,.7)" }}>
            What listed, what sold, and which cities moved meaningfully. Written by hand from live MLS data. No generic
            listing blast.
          </p>
        </div>
        {phase === "confirm_sent" || phase === "already" ? (
          <div
            role="status"
            className="font-mono"
            style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".14em", color: "#C13E17", lineHeight: 1.8, flex: "0 1 auto" }}
          >
            {phase === "already" ? "YOU'RE ALREADY ON THE LIST — SEE YOU SUNDAY." : "CHECK YOUR INBOX — ONE CLICK THERE AND YOU'RE IN."}
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", gap: 8, flex: "0 1 420px", minWidth: 260, flexWrap: "wrap" }}>
            {/* honeypot — humans never see it */}
            <input
              type="text"
              name="website"
              value={hp}
              onChange={(e) => setHp(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
            />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address for The Letter"
              style={{
                flex: "1 1 200px",
                minWidth: 0,
                border: "2px solid #1D1913",
                borderRadius: 999,
                padding: "12px 18px",
                fontSize: 14,
                background: "#FBF7EE",
                fontFamily: "inherit",
              }}
            />
            <button
              type="submit"
              disabled={phase === "sending"}
              className="btn-primary"
              style={{
                background: "#D9481F",
                color: "#F6F1E6",
                border: "2px solid #D9481F",
                borderRadius: 999,
                padding: "12px 22px",
                fontWeight: 700,
                fontSize: 13.5,
                cursor: "pointer",
                fontFamily: "inherit",
                opacity: phase === "sending" ? 0.7 : 1,
              }}
            >
              {phase === "sending" ? "Sending…" : "Get the Letter"}
            </button>
            {error && (
              <div role="alert" className="font-mono" style={{ flexBasis: "100%", fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: "#C13E17" }}>
                {error.toUpperCase()}
              </div>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
