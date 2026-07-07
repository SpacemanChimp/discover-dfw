/* TREC-required disclosure links (22 TAC §531.18 and §531.20): the exact
   link labels below, in at least 10-point font (10pt ≈ 13.3px; rendered at
   14px), pointing directly at the hosted forms. Keep the wording verbatim. */

const trecLink: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.55,
  color: "rgba(246,241,230,.88)",
  textDecoration: "underline",
  textUnderlineOffset: 3,
  width: "fit-content",
  padding: "8px 0",
};

export default function TrecLinks() {
  return (
    <div>
      <div
        className="font-mono"
        style={{ fontSize: 10, letterSpacing: ".26em", color: "#E88D6B", marginBottom: 10 }}
      >
        TREC DISCLOSURES
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <a
          className="foot-link"
          href="/trec/information-about-brokerage-services.pdf"
          target="_blank"
          rel="noopener noreferrer"
          style={trecLink}
        >
          Texas Real Estate Commission Information About Brokerage Services
        </a>
        <a
          className="foot-link"
          href="/trec/consumer-protection-notice.pdf"
          target="_blank"
          rel="noopener noreferrer"
          style={trecLink}
        >
          Texas Real Estate Commission Consumer Protection Notice
        </a>
      </div>
    </div>
  );
}
