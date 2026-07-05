"use client";
import { useState } from "react";
import { useShelf } from "@/lib/shelf";

/* "Membership — free, always." Email-first magic link via Supabase Auth,
   plus Google OAuth. In environments without Supabase env vars it falls
   back to the Phase-1 local stub so previews keep working. */
export default function AuthModal() {
  const shelf = useShelf();
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "sending" | "sent">("form");
  if (!shelf.authOpen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setErr("That email doesn’t look right.");
      return;
    }
    if (shelf.authMode === "local") {
      shelf.createLocalAccount(v);
      return;
    }
    setPhase("sending");
    const error = await shelf.requestMagicLink(v);
    if (error) {
      setPhase("form");
      setErr(error);
    } else {
      setPhase("sent");
    }
  };

  const google = async () => {
    setErr(null);
    const error = await shelf.signInWithGoogle();
    if (error) setErr(error);
  };

  const close = () => {
    setPhase("form");
    setErr(null);
    shelf.closeAuth();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create a free account"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 95,
        background: "rgba(29,25,19,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#F6F1E6",
          border: "2px solid #1D1913",
          borderRadius: 22,
          padding: "24px 22px 22px",
          boxShadow: "0 30px 70px rgba(20,16,10,.45)",
          position: "relative",
          width: "100%",
          maxWidth: 420,
          animation: "fadeUp .25s ease both",
        }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 32,
            height: 32,
            borderRadius: 99,
            border: "1.5px solid #1D1913",
            background: "transparent",
            color: "#1D1913",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          ✕
        </button>

        {phase === "sent" ? (
          <div style={{ textAlign: "center", padding: "22px 4px 10px" }}>
            <div className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".26em", color: "#D9481F" }}>
              CHECK YOUR MAIL
            </div>
            <div className="font-serif" style={{ fontWeight: 900, fontSize: 29, lineHeight: 1.05, marginTop: 10 }}>
              The key is in the post.
            </div>
            <p style={{ margin: "12px auto 0", maxWidth: 320, fontSize: 14, lineHeight: 1.65, color: "rgba(29,25,19,.75)" }}>
              We sent a sign-in link to <b>{email.trim()}</b>. Open it on this device and your
              shelf comes with you.
            </p>
            <div
              className="font-mono"
              style={{ fontSize: 8.5, letterSpacing: ".16em", color: "rgba(29,25,19,.45)", marginTop: 16 }}
            >
              NOTHING ARRIVED? CHECK SPAM, OR TRY AGAIN IN A MINUTE.
            </div>
            <button
              type="button"
              onClick={close}
              style={{
                width: "100%",
                border: "2px solid #1D1913",
                borderRadius: 999,
                padding: "14px 0",
                fontWeight: 700,
                fontSize: 14,
                marginTop: 18,
                background: "#FBF7EE",
                color: "#1D1913",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Keep browsing
            </button>
          </div>
        ) : (
          <>
            <div className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".26em", color: "#D9481F" }}>
              MEMBERSHIP — FREE, ALWAYS
            </div>
            <div className="font-serif" style={{ fontWeight: 900, fontSize: 31, lineHeight: 1.05, marginTop: 10 }}>
              Make yourself at&nbsp;home.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 16 }}>
              {[
                "Your shelf and searches, on every device",
                "Price-cut and status alerts on saved homes",
                "The Letter — one calm market email a week",
              ].map((t) => (
                <div key={t} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span style={{ color: "#D9481F", fontSize: 13 }}>✳</span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.5, color: "rgba(29,25,19,.8)" }}>{t}</span>
                </div>
              ))}
            </div>
            <form onSubmit={submit}>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErr(null);
                }}
                placeholder="you@northtexas.com"
                autoFocus
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "2px solid #1D1913",
                  borderRadius: 999,
                  padding: "14px 18px",
                  marginTop: 18,
                  background: "#FBF7EE",
                  fontSize: 13.5,
                  fontFamily: "inherit",
                  color: "#1D1913",
                  outline: "none",
                }}
              />
              {err && (
                <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".12em", color: "#D9481F", marginTop: 8 }}>
                  {err.toUpperCase()}
                </div>
              )}
              <button
                type="submit"
                disabled={phase === "sending"}
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
                  cursor: phase === "sending" ? "wait" : "pointer",
                  fontFamily: "inherit",
                  opacity: phase === "sending" ? 0.7 : 1,
                }}
              >
                {phase === "sending"
                  ? "Sending your link…"
                  : shelf.authMode === "supabase"
                  ? "Email me a sign-in link"
                  : "Create my account"}
              </button>
            </form>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
              <span style={{ flex: 1, height: 1, background: "rgba(29,25,19,.2)" }} />
              <span className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".2em", color: "rgba(29,25,19,.45)" }}>
                OR
              </span>
              <span style={{ flex: 1, height: 1, background: "rgba(29,25,19,.2)" }} />
            </div>
            <button
              type="button"
              onClick={google}
              disabled={shelf.authMode === "local"}
              title={shelf.authMode === "local" ? "Accounts arrive with the backend environment" : undefined}
              style={{
                width: "100%",
                border: "2px solid #1D1913",
                borderRadius: 999,
                padding: "14px 0",
                textAlign: "center",
                fontWeight: 700,
                fontSize: 14,
                marginTop: 12,
                background: "#FBF7EE",
                color: shelf.authMode === "local" ? "rgba(29,25,19,.45)" : "#1D1913",
                cursor: shelf.authMode === "local" ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              Continue with Google
            </button>
            <div
              className="font-mono"
              style={{ textAlign: "center", fontSize: 8, letterSpacing: ".16em", color: "rgba(29,25,19,.45)", marginTop: 14 }}
            >
              NO PASSWORDS · UNSUBSCRIBE ANYTIME · WE NEVER SELL YOUR NUMBER
            </div>
          </>
        )}
      </div>
    </div>
  );
}
