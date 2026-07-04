import TrecLinks from "@/components/TrecLinks";

/* Reserved MLS/IDX compliance block for every search + listing surface.
   When Trestle IDX Plus lands, this carries the NTREIS-required broker
   identification, IDX disclaimer, and data-refresh timestamp. */
export default function MLSComplianceFooter({ asOf }: { asOf: string }) {
  const stamp = new Date(asOf).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
  return (
    <footer style={{ background: "#1D1913", color: "#F6F1E6" }}>
      <div style={{ maxWidth: 1380, margin: "0 auto", padding: "34px 4vw 30px" }}>
        <div
          className="font-mono"
          style={{ fontSize: 10, letterSpacing: ".26em", color: "#E88D6B", marginBottom: 12 }}
        >
          MLS DISCLOSURES — RESERVED
        </div>
        <p
          style={{
            margin: 0,
            maxWidth: 860,
            fontSize: 12.5,
            lineHeight: 1.7,
            color: "rgba(246,241,230,.65)",
          }}
        >
          All listings shown are <b style={{ color: "#E88D6B" }}>fictional placeholders</b> pending
          the live IDX feed. [Reserved: broker identification · “Listings courtesy of the North
          Texas Real Estate Information Systems (NTREIS) IDX program” · information is deemed
          reliable but not guaranteed and should be independently verified · listings marked with
          the IDX logo are held by brokerage firms other than the site owner.]
        </p>
        <div
          className="font-mono"
          style={{ marginTop: 12, fontSize: 9.5, letterSpacing: ".16em", color: "rgba(246,241,230,.45)" }}
        >
          DATA LAST REFRESHED {stamp.toUpperCase()} CT · MOCK FEED
        </div>
        <div
          style={{
            borderTop: "1px solid rgba(246,241,230,.18)",
            marginTop: 22,
            paddingTop: 22,
          }}
        >
          <TrecLinks />
        </div>
      </div>
    </footer>
  );
}
