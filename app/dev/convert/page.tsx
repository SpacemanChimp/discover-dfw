import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BuildMyShortlist from "@/components/convert/BuildMyShortlist";
import CompareThisCity from "@/components/convert/CompareThisCity";
import CuratedHomes from "@/components/convert/CuratedHomes";
import NewBuildIncentives from "@/components/convert/NewBuildIncentives";
import PlanBuilderTour from "@/components/convert/PlanBuilderTour";
import HomeownerEquityPlan from "@/components/convert/HomeownerEquityPlan";
import HumanSearchHelp from "@/components/convert/HumanSearchHelp";

/* LOCAL TEST HARNESS for the conversion panels — never available in
   production (404s unless ALLOW_DEV_HARNESS=1, which production must not
   set). The panels are not mounted on any public template yet; this page
   is their only mount point. Submissions here are REAL intake posts
   (dev = FUB dry-run, emails dry-run) — use test data. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conversion panel harness (dev)",
  robots: { index: false, follow: false },
};

const VARIANTS: [string, React.ComponentType<{ citySlug?: string | null; community?: string | null }>][] = [
  ["BuildMyShortlist — city reports + homepage", BuildMyShortlist],
  ["CompareThisCity — city reports + comparison surfaces", CompareThisCity],
  ["CuratedHomes — city, neighborhood & homes-search pages", CuratedHomes],
  ["NewBuildIncentives — master-planned community & builder pages", NewBuildIncentives],
  ["PlanBuilderTour — new-construction pages", PlanBuilderTour],
  ["HomeownerEquityPlan — city & neighborhood pages", HomeownerEquityPlan],
  ["HumanSearchHelp — live home search", HumanSearchHelp],
];

export default function ConvertHarness() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_HARNESS !== "1") {
    notFound();
  }
  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh", padding: "40px 4vw 80px" }}>
      <h1 className="font-serif" style={{ fontWeight: 900, fontSize: 34, margin: 0 }}>
        Conversion panel harness
      </h1>
      <p className="font-mono" style={{ fontSize: 10, letterSpacing: ".18em", color: "rgba(29,25,19,.55)", marginTop: 10 }}>
        DEV ONLY · SUBMITS REAL INTAKE POSTS (DRY-RUN DOWNSTREAM IN DEV) · TEST AT 320PX, KEYBOARD-ONLY, AND
        PREFERS-REDUCED-MOTION · CONTEXT: citySlug=frisco, community=wildcat-ranch
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,92vw),1fr))", gap: 24, marginTop: 28 }}>
        {VARIANTS.map(([label, Cmp]) => (
          <section key={label} aria-label={label}>
            <h2 className="font-mono" style={{ fontSize: 10.5, letterSpacing: ".2em", color: "#C13E17", margin: "0 0 10px" }}>
              {label.toUpperCase()}
            </h2>
            <Cmp citySlug="frisco" community="wildcat-ranch" />
          </section>
        ))}
      </div>
      {/* 320px containment check — the narrowest lane a panel must survive */}
      <section aria-label="320px frame" style={{ marginTop: 40 }}>
        <h2 className="font-mono" style={{ fontSize: 10.5, letterSpacing: ".2em", color: "#C13E17", margin: "0 0 10px" }}>
          320PX FRAME
        </h2>
        <div style={{ width: 320, border: "1px dashed rgba(29,25,19,.4)" }}>
          <BuildMyShortlist citySlug="frisco" />
        </div>
      </section>
    </div>
  );
}
