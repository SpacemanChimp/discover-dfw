import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { getMlsProvider, isLiveMls } from "@/lib/mls";
import type { SearchFilters, SearchResult } from "@/lib/mls/types";
import { searchFiltersToQueryString } from "@/lib/mls/url";
import SearchNav from "./SearchNav";
import LandToolbar from "./LandToolbar";
import Pager from "./Pager";
import ListingResultsRail from "./ListingResultsRail";
import LiveMapPanel from "./LiveMapPanel";
import MLSComplianceFooter from "./MLSComplianceFooter";
import HomesSplit from "./HomesSplit";
import LandDueDiligence from "./LandDueDiligence";
import LandCTA from "@/components/convert/LandCTA";
import LastUpdatedStamp from "@/components/compliance/LastUpdatedStamp";
import { getEditorState, type EditorState } from "@/lib/editor/overrides";
import { RichDoc } from "@/lib/editor/render";
import PreviewBanner from "@/components/editor/PreviewBanner";
import { applyLayout } from "@/lib/editor/blocks-render";
import { TEMPLATE_SECTIONS, type LayoutDoc } from "@/lib/editor/blocks.ts";

/* "/land" — the land-only search surface. Reuses the Map Room's rail + live
   map + toolbar infrastructure (not a second engine): the filters carry
   land:true so only PropertyType='Land' rows ever appear, scoped to the 8
   DFW-metro counties. Desktop: rail + pinned map. Mobile: map-first with the
   LIST/MAP toggle. Below the product: the due-diligence guide, then one land
   CTA, then the IDX compliance footer.

   Live mode streams (shell first, rail/footer inside Suspense) exactly like
   MapRoom so a cold Supabase lambda never blocks first paint. */
export default async function LandRoom({
  query,
  view = "map",
  leadHelp = false,
}: {
  query: SearchFilters;
  view?: "list" | "map";
  /** reserved for parity with MapRoom; the land CTA is always the ask here */
  leadHelp?: boolean;
}) {
  void leadHelp;
  const provider = getMlsProvider();
  // land:true is forced here so a hand-typed /land URL without ?land=1 still
  // renders land-only (the toolbar always re-serializes it, but never trust
  // the client to set the scope)
  const effective: SearchFilters = { ...query, land: true };
  const pagerQs = searchFiltersToQueryString(effective);
  // EDITOR-desk overrides (intro / guide) — code content is the fallback
  const ed = await getEditorState("/land");
  const roomLayout = (ed.regions["__layout"]?.json as LayoutDoc | undefined) ?? null;

  if (!isLiveMls) {
    const result = await provider.searchListings(effective);
    return (
      <Shell asOf={result.mlsLastUpdated} ed={ed}>
        {applyLayout(roomLayout, TEMPLATE_SECTIONS["/land"], {
          intro: <RoomIntro ed={ed} />,
          search: (
            <>
              <LandToolbar query={effective} />
              <HomesSplit
                initialView={view}
                rail={
                  <>
                    <ListingResultsRail result={result} statuses={effective.statuses} land />
                    <Pager total={result.total} page={result.page} pageSize={result.pageSize} basePath="/land" qs={pagerQs} />
                  </>
                }
                map={<LiveMapPanel qs={searchFiltersToQueryString(effective)} land basePath="/land" />}
              />
            </>
          ),
          guide: <LandDueDiligence override={ed.regions["guide"] ? <RichDoc doc={ed.regions["guide"].json} /> : undefined} />,
          cta: <LandCTA citySlug={effective.citySlug} />,
        })}
        <MLSComplianceFooter asOf={result.mlsLastUpdated} />
      </Shell>
    );
  }

  const resultPromise = unstable_cache(
    () => provider.searchListings(effective),
    ["land-search", searchFiltersToQueryString(effective), String(effective.page ?? 1), String(effective.pageSize ?? "")],
    { revalidate: 120 }
  )();

  return (
    <Shell
      ed={ed}
      freshness={
        <Suspense fallback={null}>
          <FreshnessStamp resultPromise={resultPromise} />
        </Suspense>
      }
    >
      {applyLayout(roomLayout, TEMPLATE_SECTIONS["/land"], {
        intro: <RoomIntro ed={ed} />,
        search: (
          <>
            <LandToolbar query={effective} />
            <HomesSplit
              initialView={view}
              rail={
                <Suspense fallback={<RailSkeleton />}>
                  <RailResults resultPromise={resultPromise} qs={pagerQs} statuses={effective.statuses} />
                </Suspense>
              }
              map={<LiveMapPanel qs={searchFiltersToQueryString(effective)} land basePath="/land" />}
            />
          </>
        ),
        guide: <LandDueDiligence override={ed.regions["guide"] ? <RichDoc doc={ed.regions["guide"].json} /> : undefined} />,
        cta: <LandCTA citySlug={effective.citySlug} />,
      })}
      <Suspense fallback={<MLSComplianceFooter />}>
        <ComplianceSection resultPromise={resultPromise} />
      </Suspense>
    </Shell>
  );
}

/* everything above the split — nav, freshness strip, concise intro, toolbar */
function Shell({
  asOf,
  freshness,
  ed,
  children,
}: {
  asOf?: string;
  freshness?: React.ReactNode;
  ed: EditorState;
  children: React.ReactNode;
}) {
  return (
    <div className="homes-shell" style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      {ed.preview && <PreviewBanner route="/land" />}
      <SearchNav active="land" />
      <div
        className="font-mono homes-head-strip"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          padding: "8px 4vw",
          borderBottom: "1px solid rgba(29,25,19,.16)",
          fontSize: 9.5,
          letterSpacing: ".22em",
          color: "rgba(29,25,19,.62)",
        }}
      >
        <span>LOTS · ACREAGE · FARMS · RANCHES — NORTH TEXAS</span>
        <span style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span style={{ color: "#D9481F" }} aria-hidden="true">✳</span>
          <span>{isLiveMls ? "LIVE MLS FEED — NTREIS" : "LIVE MLS FEED — PLACEHOLDER"}</span>
          {asOf ? (
            <span style={{ color: "rgba(29,25,19,.5)" }}>
              <LastUpdatedStamp asOf={asOf} />
            </span>
          ) : (
            freshness
          )}
        </span>
      </div>

      {children}
    </div>
  );
}

/* the H1 + intro line — a layout SECTION (required: it owns the page H1) */
function RoomIntro({ ed }: { ed: EditorState }) {
  return (
    <div style={{ padding: "18px 4vw 6px", maxWidth: 900 }}>
      <h1 className="font-serif" style={{ margin: 0, fontWeight: 900, fontSize: "clamp(23px,3vw,32px)", lineHeight: 1.08 }}>
        Land for Sale Across Dallas–Fort Worth
      </h1>
      {ed.regions["intro"] ? (
        <div style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.55, color: "rgba(29,25,19,.72)", maxWidth: 720 }}>
          <RichDoc doc={ed.regions["intro"].json} />
        </div>
      ) : (
        <p style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.55, color: "rgba(29,25,19,.72)", maxWidth: 720 }}>
          Live NTREIS listings for residential lots, acreage, farms, ranches, and undeveloped land across the eight-county
          North Texas metro — filtered to genuine land only, never houses.
        </p>
      )}
    </div>
  );
}

async function RailResults({
  resultPromise,
  qs,
  statuses,
}: {
  resultPromise: Promise<SearchResult>;
  qs: string;
  statuses?: SearchFilters["statuses"];
}) {
  const result = await resultPromise;
  return (
    <>
      <ListingResultsRail result={result} statuses={statuses} land />
      <Pager total={result.total} page={result.page} pageSize={result.pageSize} basePath="/land" qs={qs} />
    </>
  );
}

async function ComplianceSection({ resultPromise }: { resultPromise: Promise<SearchResult> }) {
  const result = await resultPromise;
  return <MLSComplianceFooter asOf={result.mlsLastUpdated} />;
}

async function FreshnessStamp({ resultPromise }: { resultPromise: Promise<SearchResult> }) {
  const result = await resultPromise;
  return (
    <span style={{ color: "rgba(29,25,19,.5)" }}>
      <LastUpdatedStamp asOf={result.mlsLastUpdated} />
    </span>
  );
}

function RailSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }} aria-busy="true" aria-label="Loading land listings">
      <div
        className="font-mono"
        style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".26em", color: "#C13E17", borderBottom: "2px solid #1D1913", paddingBottom: 10 }}
      >
        PULLING THE LEDGER…
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rail-skeleton-card" style={{ border: "2px solid #1D1913", borderRadius: 18, overflow: "hidden", background: "#FBF7EE" }}>
          <div style={{ height: 210, background: "repeating-linear-gradient(45deg,#EFE7D6 0 12px,#E7DDC7 12px 24px)" }} />
          <div style={{ padding: "16px 18px" }}>
            <div style={{ height: 22, width: "42%", borderRadius: 6, background: "rgba(29,25,19,.1)" }} />
            <div style={{ height: 13, width: "68%", borderRadius: 6, background: "rgba(29,25,19,.08)", marginTop: 10 }} />
            <div style={{ height: 13, width: "55%", borderRadius: 6, background: "rgba(29,25,19,.08)", marginTop: 7 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
