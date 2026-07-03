"use client";
import { useState } from "react";

export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

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

          {!subscribed ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSubscribed(true);
              }}
              style={{
                display: "flex",
                gap: 12,
                maxWidth: 520,
                margin: "0 auto",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                placeholder="you@northtexas.com"
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
                  cursor: "pointer",
                }}
              >
                Sign me up
              </button>
            </form>
          ) : (
            <div
              className="font-serif"
              style={{ fontStyle: "italic", fontSize: 24, color: "#F6F1E6" }}
            >
              You&apos;re on the list — see you Sunday. ✳
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
            FREE · WEEKLY · UNSUBSCRIBE ANYTIME
          </div>
        </div>
      </div>
    </section>
  );
}
