import Link from "next/link";

/* Compact human-trust strip near "Why Discover DFW" — no form, no CTA
   competition: two quiet links that say humans stand behind the data. */
export default function HumanTrust() {
  return (
    <section aria-label="Who researches this" style={{ borderTop: "1px solid rgba(29,25,19,.16)" }}>
      <div
        style={{
          maxWidth: 1380,
          margin: "0 auto",
          padding: "26px 4vw",
          display: "flex",
          alignItems: "baseline",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        <span className="font-serif" style={{ fontStyle: "italic", fontSize: 17, color: "rgba(29,25,19,.78)" }}>
          Researched by people who drive these streets — every figure labeled with its source.
        </span>
        <span style={{ flex: 1 }} />
        <Link
          href="/how-we-research"
          className="link-underline font-mono"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "#C13E17", textDecoration: "none", padding: "8px 0" }}
        >
          HOW WE RESEARCH →
        </Link>
        <a
          href="#about"
          className="link-underline font-mono"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "#C13E17", textDecoration: "none", padding: "8px 0" }}
        >
          WHY DISCOVER DFW ↓
        </a>
      </div>
    </section>
  );
}
