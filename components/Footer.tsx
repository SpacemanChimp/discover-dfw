import Link from "next/link";
import { counties } from "@/lib/dfw-data";
import { isLiveMls } from "@/lib/mls";
import { Wordmark } from "./Logo";
import TrecLinks from "./TrecLinks";

const MOST_READ = [
  ["frisco", "Frisco"],
  ["plano", "Plano"],
  ["fort-worth", "Fort Worth"],
  ["southlake", "Southlake"],
  ["celina", "Celina"],
];

const EXPLORE = [
  ["/#map", "The map"],
  ["/new-builds", "New construction"],
  ["/land", "Land for sale"],
  ["/#cities", "The index"],
  ["/#about", "About"],
  ["/#newsletter", "The newsletter"],
];

export default function Footer() {
  return (
    <footer style={{ background: "#1D1913", color: "#F6F1E6" }}>
      <div style={{ maxWidth: 1380, margin: "0 auto", padding: "72px 4vw 30px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
            gap: "44px 32px",
          }}
        >
          <div style={{ gridColumn: "span 1", minWidth: 240 }}>
            <Wordmark href="/" fontSize={24} color="#F6F1E6" holeFill="#1D1913" />
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.7,
                color: "rgba(246,241,230,.6)",
                margin: "14px 0 0",
                maxWidth: 260,
              }}
            >
              An editorial field guide to Dallas–Fort Worth real estate. Every
              city, every county, one map.
            </p>
          </div>

          <FooterCol title="EXPLORE">
            {EXPLORE.map(([href, label]) => (
              <Link key={href} href={href} className="foot-link" style={footLink}>
                {label}
              </Link>
            ))}
          </FooterCol>

          <FooterCol title="COUNTIES">
            {counties.map((co) => (
              <Link key={co.id} href={`/#idx-${co.id}`} className="foot-link" style={footLink}>
                {co.name} County
              </Link>
            ))}
          </FooterCol>

          <FooterCol title="MOST READ">
            {MOST_READ.map(([slug, name]) => (
              <Link key={slug} href={`/city/${slug}`} className="foot-link" style={footLink}>
                {name}
              </Link>
            ))}
          </FooterCol>
        </div>

        <div
          style={{
            borderTop: "1px solid rgba(246,241,230,.18)",
            marginTop: 52,
            paddingTop: 26,
          }}
        >
          <TrecLinks />
        </div>

        <div
          className="font-mono"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
            borderTop: "1px solid rgba(246,241,230,.18)",
            marginTop: 30,
            paddingTop: 22,
            fontSize: 10,
            letterSpacing: ".16em",
            color: "rgba(246,241,230,.5)",
          }}
        >
          <span>© MMXXVI DISCOVER DFW</span>
          <span>
            {isLiveMls
              ? "LISTINGS LIVE FROM NTREIS — REFRESHED EVERY 15 MINUTES"
              : "ALL MARKET FIGURES ARE PLACEHOLDERS"}
          </span>
          <Link href="/#top" style={{ color: "#E88D6B", textDecoration: "none" }}>
            BACK TO TOP ↑
          </Link>
        </div>
      </div>
    </footer>
  );
}

const footLink: React.CSSProperties = {
  color: "rgba(246,241,230,.85)",
  textDecoration: "none",
};

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="font-mono"
        style={{ fontSize: 10, letterSpacing: ".26em", color: "#E88D6B", marginBottom: 14 }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
        {children}
      </div>
    </div>
  );
}
