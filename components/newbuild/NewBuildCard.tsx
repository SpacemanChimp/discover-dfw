import Link from "next/link";
import { bySlug, countyById, type NewBuild } from "@/lib/dfw-data";
import { slugifyHood } from "@/lib/slug";

/* One new-build community card — the exact field-guide design used in the
   homepage New Builds section, extracted so the homepage preview and the
   /new-builds directory render identical cards. Dark card on the ink band;
   links to the community's existing editorial report. Editorial figures
   (from-price, builder count) are unchanged — never MLS-derived. */

const STATUS_COLOR: Record<string, string> = {
  "NOW SELLING": "#D9481F",
  "MODELS OPEN": "#6FA8B8",
  "FINAL PHASE": "#C9A24B",
};

export default function NewBuildCard({ b }: { b: NewBuild }) {
  const city = bySlug[b.city];
  const county = countyById[city.county];
  const sc = STATUS_COLOR[b.status] || "#D9481F";
  return (
    <Link
      href={`/city/${b.city}/${slugifyHood(b.name)}`}
      className="nb-card"
      style={{
        textDecoration: "none",
        color: "#F6F1E6",
        border: "2px solid rgba(246,241,230,.18)",
        borderRadius: 18,
        background: "#241D12",
        padding: "22px 24px 24px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span
          className="font-mono"
          style={{ fontSize: 9, letterSpacing: ".18em", fontWeight: 700, color: "#1D1913", background: sc, padding: "5px 10px", borderRadius: 999 }}
        >
          {b.status}
        </span>
        <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".16em", color: "rgba(246,241,230,.5)" }}>
          {county.name.toUpperCase()} CO.
        </span>
      </div>
      <div className="font-serif" style={{ fontWeight: 900, fontSize: 25, lineHeight: 1.05 }}>
        {b.name}
      </div>
      <div className="font-mono" style={{ fontSize: 10.5, letterSpacing: ".1em", color: "#E88D6B", marginTop: 6 }}>
        {city.name}, TX
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "rgba(246,241,230,.72)", margin: "14px 0 18px", flex: 1 }}>
        {b.note}
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid rgba(246,241,230,.16)", paddingTop: 14 }}>
        <span>
          <span className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".2em", color: "rgba(246,241,230,.5)" }}>FROM</span>
          <span className="font-serif" style={{ fontWeight: 800, fontSize: 22, color: "#F6F1E6", marginLeft: 8 }}>{b.from}</span>
        </span>
        <span className="font-mono" style={{ fontSize: 10.5, color: "rgba(246,241,230,.6)" }}>{b.builders} BUILDERS</span>
      </div>
    </Link>
  );
}
