import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { getEditorState } from "@/lib/editor/overrides";
import { RichDoc } from "@/lib/editor/render";
import PreviewBanner from "@/components/editor/PreviewBanner";
import { applyLayout } from "@/lib/editor/blocks-render";
import { TEMPLATE_SECTIONS, type LayoutDoc } from "@/lib/editor/blocks.ts";
import { getPublishedNav } from "@/lib/editor/nav";

/* "How we research" — the public methodology page the homepage trust strip
   links to. Every claim here mirrors what the site already labels in place
   (NTREIS snapshots, Census 2024, TEA 2025, OSRM estimates, human-gated
   photos) — nothing new is asserted. Source of truth for the internal
   detail: docs/market-data-methodology.md. */

export const metadata: Metadata = {
  title: "How we research — sources, cadence & rules",
  description:
    "Where DiscoverDFW's market figures, school ratings, commute estimates, and photos come from — and the rules that keep fabricated numbers off the page.",
  alternates: { canonical: "/how-we-research" },
};

const SOURCES: [string, string][] = [
  [
    "MARKET FIGURES",
    "Median list prices, days on market, and listing counts come from NTREIS listing data, refreshed on a 15-minute cycle. Every figure carries its updated date and source label. We show active-listing medians only — never re-labeled as sold or closed data — and when a figure genuinely isn't available, we leave it out rather than guess.",
  ],
  [
    "SCHOOL INFORMATION",
    "Campus ratings are the Texas Education Agency's 2025 A–F accountability grades (txschools.gov). Neighborhood pages show nearby campuses by distance — never a promise of school assignment; boundaries change, so verify the exact address with the district.",
  ],
  [
    "POPULATION & COMMUTES",
    "Populations are U.S. Census Vintage 2024 estimates. Drive times are off-peak estimates computed with OpenStreetMap routing — labeled as estimates wherever they appear.",
  ],
  [
    "PHOTOGRAPHY",
    "Editorial photos publish only after a human approves them, with attribution on every frame. A page with no approved photo simply runs without one — no stock filler.",
  ],
  [
    "NEW-BUILD COMMUNITIES",
    "Builder counts, price bands, and status lines are editorial research — treat them as a starting point and verify with sales offices. Live inventory bands appear only for communities we have verified against the MLS record.",
  ],
];

export default async function HowWeResearch() {
  /* EDITOR-desk override for the lead paragraph — code text stays the
     fallback (and the guaranteed render if the override store is down).
     The Visual Builder layout ('__layout') reorders/hides the sections. */
  const ed = await getEditorState("/how-we-research");
  const introOv = ed.regions["intro"];
  const pageLayout = (ed.regions["__layout"]?.json as LayoutDoc | undefined) ?? null;
  const navItems = (await getPublishedNav()) ?? undefined;

  const sections: Record<string, React.ReactNode> = {
    intro: (
      <>
        <div className="font-mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".32em", color: "#C13E17" }}>
          THE FIELD GUIDE'S RULES
        </div>
        <h1 className="font-serif" style={{ margin: "14px 0 0", fontWeight: 900, fontSize: "clamp(34px,4.6vw,56px)", lineHeight: 1.04 }}>
          How we research.
        </h1>
        {introOv ? (
          <div style={{ margin: "18px 0 0", fontSize: 16.5, lineHeight: 1.8, color: "rgba(29,25,19,.8)" }}>
            <RichDoc doc={introOv.json} />
          </div>
        ) : (
          <p style={{ margin: "18px 0 0", fontSize: 16.5, lineHeight: 1.8, color: "rgba(29,25,19,.8)" }}>
            A field guide is only as good as its sourcing. Every number on this site is either pulled live from a named
            source or written by a person and labeled that way — and when we can't verify something, it doesn't run.
          </p>
        )}
      </>
    ),
    sources: (
      <dl style={{ margin: "40px 0 0", padding: 0 }}>
        {SOURCES.map(([term, def]) => (
          <div key={term} style={{ borderTop: "1px solid rgba(29,25,19,.2)", padding: "20px 0" }}>
            <dt className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".24em", color: "#C13E17" }}>
              {term}
            </dt>
            <dd style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.75, color: "rgba(29,25,19,.8)" }}>{def}</dd>
          </div>
        ))}
      </dl>
    ),
    closing: (
      <>
        <div className="font-mono" style={{ marginTop: 36, fontSize: 9.5, letterSpacing: ".18em", lineHeight: 2, color: "rgba(29,25,19,.55)" }}>
          QUESTIONS ABOUT A SPECIFIC FIGURE? EVERY PAGE LABELS ITS SOURCE IN PLACE.
        </div>
        <div style={{ marginTop: 26 }}>
          <Link
            href="/"
            className="link-underline font-mono"
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "#C13E17", textDecoration: "none" }}
          >
            ← BACK TO THE MAP
          </Link>
        </div>
      </>
    ),
  };

  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      {ed.preview && <PreviewBanner route="/how-we-research" />}
      <Nav navItems={navItems} />
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "64px 4vw 80px" }}>
        {applyLayout(pageLayout, TEMPLATE_SECTIONS["/how-we-research"], sections)}
      </main>
      <Footer />
    </div>
  );
}
