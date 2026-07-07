import TrecLinks from "@/components/TrecLinks";
import DataDisclaimer from "@/components/compliance/DataDisclaimer";
import LastUpdatedStamp from "@/components/compliance/LastUpdatedStamp";

/* MLS/IDX compliance block for every search + listing surface: data-source
   disclaimer, refresh stamp, and the TREC disclosure links. Copy flows from
   lib/compliance (PENDING BROKER/NTREIS/LEGAL REVIEW) except the TREC link
   labels, which are regulator-mandated and final. */
export default function MLSComplianceFooter({ asOf }: { asOf?: string }) {
  return (
    <footer style={{ background: "#1D1913", color: "#F6F1E6" }}>
      <div style={{ maxWidth: 1380, margin: "0 auto", padding: "34px 4vw 30px" }}>
        <div
          className="font-mono"
          style={{ fontSize: 10, letterSpacing: ".26em", color: "#E88D6B", marginBottom: 12 }}
        >
          MLS DISCLOSURES
        </div>
        <DataDisclaimer light />
        {/* the refresh stamp needs the rail query; while it streams, the
            disclaimer + TREC links above/below must already be on the page */}
        {asOf && (
          <div style={{ marginTop: 12 }}>
            <LastUpdatedStamp asOf={asOf} light />
          </div>
        )}
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
