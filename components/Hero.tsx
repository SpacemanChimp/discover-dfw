"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PinSvg } from "./Logo";
import HeroSearch from "./HeroSearch";

const LETTERS_1 = ["D", "I", "S", "C"];
const LETTERS_2 = ["V", "E", "R"];
const LETTERS_3 = ["D", "F", "W"];

const RISE = (delay: number): React.CSSProperties => ({
  display: "inline-block",
  animation: `riseUp .75s cubic-bezier(.22,1,.36,1) ${delay}s both`,
});
const CLIP: React.CSSProperties = {
  display: "inline-block",
  overflow: "hidden",
  verticalAlign: "bottom",
};

function TypedNext() {
  // server-render the first city so the line is NEVER blank pre-hydration
  // (and stays populated entirely without JS); the typewriter is an
  // enhancement that takes over on the client. Reduced-motion visitors
  // keep the static name — no typing loop.
  const [typed, setTyped] = useState("Frisco");
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const names = [
      "Frisco", "McKinney", "Fort Worth", "Decatur", "Southlake",
      "Rockwall", "Grapevine", "Prosper", "Wylie", "Celina", "Heath",
    ];
    let i = 0, pos = 6, dir = -1, hold = 16;
    const iv = setInterval(() => {
      if (hold > 0) { hold--; return; }
      const w = names[i];
      pos += dir;
      if (pos >= w.length) { pos = w.length; dir = -1; hold = 16; }
      if (pos <= 0 && dir === -1) { dir = 1; i = (i + 1) % names.length; hold = 3; }
      setTyped(w.slice(0, pos));
    }, 80);
    return () => clearInterval(iv);
  }, []);
  return (
    <>
      <span style={{ color: "#D9481F", fontWeight: 700 }}>{typed}</span>
      <span
        style={{
          display: "inline-block",
          width: 9,
          height: 15,
          background: "#D9481F",
          verticalAlign: -2,
          marginLeft: 2,
          animation: "caretBlink 1s steps(1) infinite",
        }}
      />
    </>
  );
}

export default function Hero({ copyOverride, regionKey }: { copyOverride?: React.ReactNode; regionKey?: string } = {}) {
  let d = 0.05;
  return (
    <header
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        minHeight: "78vh",
        padding: "72px 5vw 56px",
        overflow: "hidden",
      }}
    >
      <div className="font-mono" style={coord("left")}>32.7767° N</div>
      <div className="font-mono" style={coord("right")}>97.3308° W</div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          width: "min(560px,80vw)",
          marginBottom: 18,
          animation: "fadeUp .7s ease both",
        }}
      >
        <div style={{ flex: 1, height: 1, background: "rgba(29,25,19,.3)" }} />
      </div>

      <h1
        className="font-serif"
        style={{
          margin: 0,
          fontWeight: 900,
          fontSize: "clamp(54px,9.4vw,142px)",
          lineHeight: 0.98,
          letterSpacing: 0,
          whiteSpace: "nowrap",
        }}
      >
        {LETTERS_1.map((l) => {
          d += 0.05;
          const delay = d;
          return (
            <span key={"a" + l + delay} style={CLIP}>
              <span style={RISE(delay)}>{l}</span>
            </span>
          );
        })}
        <span
          style={{
            display: "inline-block",
            animation: "pinDrop .8s cubic-bezier(.34,1.4,.64,1) .35s both",
          }}
        >
          <PinSvg
            style={{
              height: ".74em",
              width: "auto",
              transform: "translateY(.06em)",
              margin: "0 .015em",
              filter: "drop-shadow(0 10px 16px rgba(217,72,31,.35))",
            }}
          />
        </span>
        {LETTERS_2.map((l, i) => {
          const delay = 0.25 + i * 0.05;
          return (
            <span key={"b" + l + i} style={CLIP}>
              <span style={RISE(delay)}>{l}</span>
            </span>
          );
        })}
        <span style={{ display: "inline-block", width: ".28em" }} />
        {LETTERS_3.map((l, i) => {
          const delay = 0.42 + i * 0.05;
          return (
            <span key={"c" + l + i} style={CLIP}>
              <span style={RISE(delay)}>{l}</span>
            </span>
          );
        })}
      </h1>

      <div
        style={{
          width: "min(760px,86vw)",
          marginTop: 26,
          animation: "fadeUp .6s ease .22s both",
        }}
      >
        <div style={{ height: 3, background: "#1D1913" }} />
        <div style={{ height: 1, background: "#1D1913", marginTop: 3 }} />
      </div>

      {copyOverride ? (
        <div
          data-bb-region={regionKey}
          className="font-serif"
          style={{
            maxWidth: 640,
            margin: "28px 0 0",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: "clamp(18px,2.3vw,24px)",
            lineHeight: 1.5,
            color: "rgba(29,25,19,.85)",
            animation: "fadeUp .6s ease .3s both",
          }}
        >
          {copyOverride}
        </div>
      ) : (
        <p
          data-bb-region={regionKey}
          className="font-serif"
          style={{
            maxWidth: 640,
            margin: "28px 0 0",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: "clamp(18px,2.3vw,24px)",
            lineHeight: 1.5,
            color: "rgba(29,25,19,.85)",
            animation: "fadeUp .6s ease .3s both",
          }}
        >
          A living atlas of Dallas–Fort Worth real estate — every city, every
          county, one clickable map.
        </p>
      )}

      <HeroSearch />

      <div
        className="font-mono"
        style={{
          marginTop: 18,
          fontSize: 12.5,
          letterSpacing: ".2em",
          color: "rgba(29,25,19,.6)",
          animation: "fadeUp .6s ease .38s both",
        }}
      >
        WHERE TO NEXT: <TypedNext />
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          justifyContent: "center",
          marginTop: 34,
          animation: "fadeUp .6s ease .45s both",
        }}
      >
        <Link
          href="#map"
          className="btn-primary"
          style={{
            background: "#D9481F",
            color: "#F6F1E6",
            textDecoration: "none",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: ".03em",
            padding: "17px 32px",
            borderRadius: 999,
            border: "2px solid #D9481F",
            display: "inline-flex",
            alignItems: "center",
            gap: 11,
            boxShadow: "0 12px 26px rgba(217,72,31,.26)",
          }}
        >
          Explore the map{" "}
          <span
            style={{
              animation: "bobY 1.6s ease-in-out infinite",
              display: "inline-block",
            }}
          >
            ↓
          </span>
        </Link>
        <Link
          href="#cities"
          className="btn-outline"
          style={{
            background: "transparent",
            color: "#1D1913",
            textDecoration: "none",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: ".03em",
            padding: "17px 32px",
            borderRadius: 999,
            border: "2px solid #1D1913",
          }}
        >
          Browse the index
        </Link>
      </div>
    </header>
  );
}

function coord(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: 26,
    [side]: "4vw",
    fontSize: 10,
    letterSpacing: ".18em",
    color: "rgba(29,25,19,.4)",
  };
}
