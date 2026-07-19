import Link from "next/link";
import { newBuilds, bySlug } from "@/lib/dfw-data";
import NewBuildCard from "./newbuild/NewBuildCard";

/* Homepage New Builds PREVIEW — a strong six-card taste of new construction,
   not the full 33-card catalog (that lives on /new-builds#directory). Keeps
   its place after the map + featured picks, its id (#new-builds) so old
   anchors still land, and the field-guide identity. The two actions carry the
   reader into the dedicated search + directory. */

/* Six geographically varied communities: the first community from each
   distinct county in the editorial order. Deterministic — no hand-picked list
   to drift from the data. */
function featuredSix() {
  const seenCounty = new Set<string>();
  const out: typeof newBuilds = [];
  for (const b of newBuilds) {
    const county = bySlug[b.city]?.county;
    if (!county || seenCounty.has(county)) continue;
    seenCounty.add(county);
    out.push(b);
    if (out.length === 6) break;
  }
  return out;
}

export default function NewBuilds({
  liveMls,
  introOverride,
}: {
  liveMls?: boolean;
  /** EDITOR-desk override for the intro paragraph (code copy = fallback) */
  introOverride?: React.ReactNode;
}) {
  void liveMls;
  const featured = featuredSix();
  return (
    <section id="new-builds" style={{ background: "#1D1913", color: "#F6F1E6", borderTop: "2px solid #1D1913" }}>
      <div style={{ maxWidth: 1380, margin: "0 auto", padding: "88px 4vw" }}>
        <div
          data-reveal="1"
          style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginBottom: 26 }}
        >
          <div>
            <div className="font-mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".32em", color: "#E88D6B", marginBottom: 14 }}>
              NEW CONSTRUCTION — ACTIVELY SELLING
            </div>
            <h2 className="font-serif" style={{ margin: 0, fontWeight: 900, fontSize: "clamp(34px,4.4vw,58px)", lineHeight: 1.02, color: "#F6F1E6" }}>
              Fresh dirt, first owners.
            </h2>
          </div>
          {introOverride ? (
            <div style={{ margin: "0 0 6px", maxWidth: 360, fontSize: 15, lineHeight: 1.6, color: "rgba(246,241,230,.7)" }}>
              {introOverride}
            </div>
          ) : (
            <p style={{ margin: "0 0 6px", maxWidth: 360, fontSize: 15, lineHeight: 1.6, color: "rgba(246,241,230,.7)" }}>
              A few of the master-planned communities taking contracts right now. Search every new-construction listing, or browse all {newBuilds.length} communities, on the new builds page.
            </p>
          )}
        </div>

        <div
          data-reveal="1"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 18 }}
        >
          {featured.map((b) => (
            <NewBuildCard key={b.name} b={b} />
          ))}
        </div>

        {/* one preview → destination action pair; primary search, quieter
            directory link. Not a second homepage CTA — it points into the
            new-builds product. */}
        <div
          data-reveal="1"
          style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", marginTop: 34 }}
        >
          <Link
            href="/new-builds"
            style={{
              background: "#D9481F",
              color: "#F6F1E6",
              textDecoration: "none",
              border: "2px solid #D9481F",
              borderRadius: 999,
              padding: "15px 28px",
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: ".01em",
              boxShadow: "0 10px 24px rgba(217,72,31,.26)",
              whiteSpace: "nowrap",
            }}
          >
            Search All New Construction
          </Link>
          <Link
            href="/new-builds#directory"
            className="font-mono"
            style={{
              color: "rgba(246,241,230,.75)",
              textDecoration: "none",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".16em",
              borderBottom: "1.5px solid rgba(246,241,230,.4)",
              paddingBottom: 3,
              whiteSpace: "nowrap",
            }}
          >
            BROWSE ALL {newBuilds.length} COMMUNITIES →
          </Link>
        </div>
      </div>
    </section>
  );
}
