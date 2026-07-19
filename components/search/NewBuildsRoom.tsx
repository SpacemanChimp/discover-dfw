import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { getMlsProvider, isLiveMls, PROPERTY_TYPE_OPTIONS } from "@/lib/mls";
import type { SearchFilters, SearchResult } from "@/lib/mls/types";
import { searchFiltersToQueryString } from "@/lib/mls/url";
import SearchNav from "./SearchNav";
import SearchToolbar from "./SearchToolbar";
import Pager from "./Pager";
import ListingResultsRail from "./ListingResultsRail";
import LiveMapPanel from "./LiveMapPanel";
import MLSComplianceFooter from "./MLSComplianceFooter";
import HomesSplit from "./HomesSplit";
import NewBuildEducation from "./NewBuildEducation";
import NewBuildDirectory from "@/components/newbuild/NewBuildDirectory";
import NewBuildCTA from "@/components/convert/NewBuildCTA";
import LastUpdatedStamp from "@/components/compliance/LastUpdatedStamp";
import { getEditorState, type EditorState } from "@/lib/editor/overrides";
import { isBuilderMode } from "@/lib/editor/builder-mode";
import { RichDoc } from "@/lib/editor/render";
import PreviewBanner from "@/components/editor/PreviewBanner";
import { applyLayout } from "@/lib/editor/blocks-render";
import { TEMPLATE_SECTIONS, type LayoutDoc } from "@/lib/editor/blocks.ts";

/* "/new-builds" — the new-construction surface. Reuses the Map Room's rail +
   live map + toolbar (not a second engine): the filter is locked to the exact
   canonical new-build filter (newBuildsOnly, i.e. /homes?new=1) via
   SearchToolbar's lockNewBuilds/basePath props, so results match /homes?new=1
   and every filter change stays on /new-builds with the new-build state on.

   Below the search: the full editorial community directory, buyer education,
   and one conversion band, then the IDX compliance footer. Live mode streams
   the shell first (rail/footer inside Suspense), exactly like MapRoom/LandRoom. */
export default async function NewBuildsRoom({
  query,
  view = "map",
}: {
  query: SearchFilters;
  view?: "list" | "map";
}) {
  const provider = getMlsProvider();
  // newBuildsOnly is forced here so a hand-typed /new-builds URL without ?new=1
  // still renders the new-construction set (the toolbar re-serializes it too).
  const effective: SearchFilters = { ...query, newBuildsOnly: true };
  const pagerQs = searchFiltersToQueryString(effective);
  // EDITOR-desk overrides (intro / guide) — code content is the fallback
  const ed = await getEditorState("/new-builds");
  const builder = ed.preview && (await isBuilderMode());
  const roomLayout = (ed.regions["__layout"]?.json as LayoutDoc | undefined) ?? null;

  if (!isLiveMls) {
    const result = await provider.searchListings(effective);
    return (
      <Shell asOf={result.mlsLastUpdated} ed={ed} builder={builder}>
        {applyLayout(roomLayout, TEMPLATE_SECTIONS["/new-builds"], {
          intro: <RoomIntro ed={ed} builder={builder} />,
          search: (
            <>
              <SearchToolbar query={effective} propertyTypes={PROPERTY_TYPE_OPTIONS} basePath="/new-builds" lockNewBuilds />
              <HomesSplit
                initialView={view}
                rail={
                  <>
                    <ListingResultsRail result={result} statuses={effective.statuses} newBuilds />
                    <Pager total={result.total} page={result.page} pageSize={result.pageSize} basePath="/new-builds" qs={pagerQs} />
                  </>
                }
                map={<LiveMapPanel qs={searchFiltersToQueryString(effective)} basePath="/new-builds" />}
              />
            </>
          ),
          directory: <NewBuildDirectory />,
          guide: <NewBuildEducation override={ed.regions["guide"] ? <RichDoc doc={ed.regions["guide"].json} region={builder ? "guide" : undefined} /> : undefined} />,
          cta: <NewBuildCTA />,
        }, undefined, builder)}
        <MLSComplianceFooter asOf={result.mlsLastUpdated} />
      </Shell>
    );
  }

  const resultPromise = unstable_cache(
    () => provider.searchListings(effective),
    ["newbuilds-search", searchFiltersToQueryString(effective), String(effective.page ?? 1), String(effective.pageSize ?? "")],
    { revalidate: 120 }
  )();

  return (
    <Shell
      ed={ed}
      builder={builder}
      freshness={
        <Suspense fallback={null}>
          <FreshnessStamp resultPromise={resultPromise} />
        </Suspense>
      }
    >
      {applyLayout(roomLayout, TEMPLATE_SECTIONS["/new-builds"], {
        intro: <RoomIntro ed={ed} builder={builder} />,
        search: (
          <>
            <SearchToolbar query={effective} propertyTypes={PROPERTY_TYPE_OPTIONS} basePath="/new-builds" lockNewBuilds />
            <HomesSplit
              initialView={view}
              rail={
                <Suspense fallback={<RailSkeleton />}>
                  <RailResults resultPromise={resultPromise} qs={pagerQs} statuses={effective.statuses} />
                </Suspense>
              }
              map={<LiveMapPanel qs={searchFiltersToQueryString(effective)} basePath="/new-builds" />}
            />
          </>
        ),
        directory: <NewBuildDirectory />,
        guide: <NewBuildEducation override={ed.regions["guide"] ? <RichDoc doc={ed.regions["guide"].json} region={builder ? "guide" : undefined} /> : undefined} />,
        cta: <NewBuildCTA />,
      }, undefined, builder)}
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
  builder,
  children,
}: {
  asOf?: string;
  freshness?: React.ReactNode;
  ed: EditorState;
  builder?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="homes-shell" style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      {ed.preview && !builder && <PreviewBanner route="/new-builds" />}
      <SearchNav active="new-builds" />
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
        <span>NEW CONSTRUCTION — MASTER-PLANNED &amp; MOVE-IN READY</span>
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
function RoomIntro({ ed, builder }: { ed: EditorState; builder?: boolean }) {
  return (
    <div style={{ padding: "18px 4vw 6px", maxWidth: 900 }}>
      <h1 className="font-serif" style={{ margin: 0, fontWeight: 900, fontSize: "clamp(22px,2.9vw,32px)", lineHeight: 1.08 }}>
        New Construction Homes for Sale Across Dallas–Fort Worth
      </h1>
      {ed.regions["intro"] ? (
        <div style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.55, color: "rgba(29,25,19,.72)", maxWidth: 720 }}>
          <RichDoc doc={ed.regions["intro"].json} region={builder ? "intro" : undefined} />
        </div>
      ) : (
        <p data-bb-region={builder ? "intro" : undefined} style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.55, color: "rgba(29,25,19,.72)", maxWidth: 720 }}>
          Search live NTREIS new-construction listings across North Texas, then browse the master-planned communities taking
          contracts right now. Filtered to new builds only.
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
      <ListingResultsRail result={result} statuses={statuses} newBuilds />
      <Pager total={result.total} page={result.page} pageSize={result.pageSize} basePath="/new-builds" qs={qs} />
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
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }} aria-busy="true" aria-label="Loading new-construction listings">
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
