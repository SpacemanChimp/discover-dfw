/* The IDX data disclaimer block — "deemed reliable, not guaranteed" plus
   the data-source paragraph. Copy lives in lib/compliance and is
   PENDING BROKER/NTREIS/LEGAL REVIEW; swap it there once the required
   language arrives and every surface updates together. */
import { DATA_SOURCE_DISCLAIMER, MOCK_FOOTER_DISCLAIMER } from "@/lib/compliance";
import { isLiveMls } from "@/lib/mls";

export default function DataDisclaimer({ light }: { light?: boolean }) {
  return (
    <p
      style={{
        margin: 0,
        maxWidth: 860,
        fontSize: 12.5,
        lineHeight: 1.7,
        color: light ? "rgba(246,241,230,.65)" : "rgba(29,25,19,.7)",
      }}
    >
      {isLiveMls ? DATA_SOURCE_DISCLAIMER : MOCK_FOOTER_DISCLAIMER}
    </p>
  );
}
