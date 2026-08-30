import Link from "next/link";
import TrustPhoneLink from "./TrustPhoneLink";

/* Human-trust block — placed BEFORE the giant city index so a visitor
   meets the people behind the data before the longest scroll.

   Every fact here is verified against project data: the operator identity
   comes from the served TREC IABS notice
   (public/trec/information-about-brokerage-services.pdf — Matthew Davis,
   TX sales agent license 0733604, sponsored by House Brokerage LLC,
   license 9008104, Flower Mound). No approved people photograph exists in
   the project's photo store, so this stays deliberately TEXT-ONLY rather
   than inserting a stock face. Editorial voice, no exaggerated claims. */
export default function HumanTrust() {
  return (
    <section aria-label="Who researches this" style={{ borderTop: "1px solid rgba(29,25,19,.16)", background: "#F6F1E6" }}>
      <div style={{ maxWidth: 1380, margin: "0 auto", padding: "44px 4vw 46px" }}>
        <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".26em", color: "#C13E17" }}>
          WHO&rsquo;S BEHIND THIS
        </div>
        <div
          style={{
            display: "flex",
            gap: "20px 56px",
            flexWrap: "wrap",
            alignItems: "flex-start",
            marginTop: 12,
          }}
        >
          <div style={{ flex: "1 1 520px", minWidth: 0 }}>
            <h2 className="font-serif" style={{ fontWeight: 900, fontSize: "clamp(22px,2.6vw,30px)", lineHeight: 1.1, margin: 0 }}>
              Built and researched by a working DFW real-estate professional.
            </h2>
            <p style={{ margin: "12px 0 0", fontSize: 14.5, lineHeight: 1.7, color: "rgba(29,25,19,.78)", maxWidth: 720 }}>
              Discover DFW is built by Matthew Davis, a Texas real-estate sales agent (license 0733604) with House
              Brokerage LLC in Flower Mound. The site pairs the live NTREIS feed with street-level local research, and
              every figure is labeled with its source. When you want a human read on a home or a city, you ask a real
              person, not a call center.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 6 }}>
            <TrustPhoneLink />
            <Link
              href="/how-we-research"
              className="link-underline font-mono"
              style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "#C13E17", textDecoration: "none", padding: "4px 0" }}
            >
              HOW WE RESEARCH →
            </Link>
            <div className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".14em", color: "rgba(29,25,19,.55)", lineHeight: 1.9 }}>
              TREC:{" "}
              <a href="/trec/information-about-brokerage-services.pdf" style={{ color: "rgba(29,25,19,.65)" }}>
                INFORMATION ABOUT BROKERAGE SERVICES
              </a>
              {" · "}
              <a href="/trec/consumer-protection-notice.pdf" style={{ color: "rgba(29,25,19,.65)" }}>
                CONSUMER PROTECTION NOTICE
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
