/* Data-freshness stamp — IDX rules require showing when the data was last
   refreshed. One formatter (lib/compliance), used on the dossier and in
   every search-surface footer. */
import { formatUpdatedStamp, MLS_SOURCE } from "@/lib/compliance";
import { isLiveMls } from "@/lib/mls";

export default function LastUpdatedStamp({
  asOf,
  prefix = "DATA LAST REFRESHED",
  light,
}: {
  asOf: string;
  prefix?: string;
  /** Cream-on-ink variant for the dark compliance footer. */
  light?: boolean;
}) {
  return (
    <span
      className="font-mono"
      style={{
        fontSize: light ? 9.5 : 8.5,
        letterSpacing: ".16em",
        color: light ? "rgba(246,241,230,.55)" : "rgba(29,25,19,.62)",
      }}
    >
      {prefix} {formatUpdatedStamp(asOf)} · {isLiveMls ? MLS_SOURCE.liveLong : "MOCK FEED"}
    </span>
  );
}
