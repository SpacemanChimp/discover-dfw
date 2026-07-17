import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { bySlug, countyById, cities, type City } from "@/lib/dfw-data";
import { getMlsProvider, isLiveMls, PROPERTY_TYPE_OPTIONS } from "@/lib/mls";
import type { SearchFilters, SearchResult } from "@/lib/mls/types";
import { SCHOOL_SOURCE_NOTE } from "@/lib/compliance";
import { searchFiltersToQueryString } from "@/lib/mls/url";
import SearchNav from "./SearchNav";
import SearchToolbar from "./SearchToolbar";
import Pager from "./Pager";
import ListingResultsRail from "./ListingResultsRail";
import SearchMapPanel from "./SearchMapPanel";
import LiveMapPanel from "./LiveMapPanel";
import MobileCitySearchIndex from "./MobileCitySearchIndex";
import MLSComplianceFooter from "./MLSComplianceFooter";
import SearchHelpSlot from "@/components/convert/SearchHelpSlot";
import HomesSplit from "./HomesSplit";

/* "The Map Room" — desktop: listing rail + city-aware map panel. Mobile:
   the index (cities first) until a city is chosen, then the rail
   full-width, with a floating list<->map toggle. Composed from
   ListingResultsRail / SearchMapPanel / MobileCitySearchIndex; this
   component owns data fetching + layout.

   Live mode streams: the shell (nav, toolbar, map pane) returns with NO
   awaits while the rail/index/footer resolve inside Suspense — a cold
   Supabase lambda no longer blocks first paint. Mock mode keeps the
   original fully blocking tree (the mock provider is instant). */
export default async function MapRoom({
  query,
  citySlug,
  authFailed,
  leadHelp = false,
}: {
  query: SearchFilters;
  /** Set when rendered from /city/[slug]/homes — city fixed by the path. */
  citySlug?: string;
  /** True when /auth/callback bounced here after a failed link exchange. */
  authFailed?: boolean;
  /** Mount the delayed HumanSearchHelp slot (lead backend configured). */
  leadHelp?: boolean;
}) {
  const provider = getMlsProvider();
  const effective: SearchFilters = { ...query, citySlug: citySlug || query.citySlug };

  const city = effective.citySlug ? bySlug[effective.citySlug] : undefined;
  const county = city ? countyById[city.county] : undefined;
  const basePath = citySlug ? `/city/${citySlug}/homes` : "/homes";
  const pagerQs = searchFiltersToQueryString(effective, !!citySlug);
  // source-qualification for the results surface when a school/district
  // filter is active (required compliance copy — see lib/compliance)
  const sourceNote = effective.school || effective.district ? SCHOOL_SOURCE_NOTE : undefined;

  if (!isLiveMls) {
    const [result, counts] = await Promise.all([
      provider.searchListings(effective),
      // per-city active counts for map context + the mobile index
      provider.getActiveCountsByCity(),
    ]);
    const metroTotal = Object.values(counts).reduce((a, b) => a + b, 0);
    return (
      <Shell effective={effective} citySlug={citySlug} authFailed={authFailed}>
        <HomesSplit
          railDesktopOnly={!city}
          rail={
            <>
              <ListingResultsRail result={result} city={city} countyName={county?.name} sourceNote={sourceNote} />
              <Pager
                total={result.total}
                page={result.page}
                pageSize={result.pageSize}
                basePath={basePath}
                qs={pagerQs}
              />
              {leadHelp && <SearchHelpSlot citySlug={effective.citySlug} />}
            </>
          }
          map={
            <SearchMapPanel
              listings={result.listings}
              activeCitySlug={effective.citySlug}
              total={metroTotal}
            />
          }
          extra={!city ? <MobileCitySearchIndex counts={counts} /> : undefined}
        />
        <MLSComplianceFooter asOf={result.mlsLastUpdated} />
      </Shell>
    );
  }

  /* Listings are public rows (no per-user data), so Vercel's shared Data
     Cache is safe — cold lambdas reuse a warm result instead of waiting on
     Supabase. searchFiltersToQueryString omits page/pageSize, hence the
     explicit key parts. Started, NOT awaited — the Suspense subcomponents
     below resolve them while the shell streams. */
  const resultPromise = unstable_cache(
    () => provider.searchListings(effective),
    [
      "rail-search",
      searchFiltersToQueryString(effective),
      String(effective.page ?? 1),
      String(effective.pageSize ?? ""),
    ],
    { revalidate: 120 }
  )();
  const countsPromise = city
    ? null // counts only feed the mobile index — skip the query city-side
    : unstable_cache(() => provider.getActiveCountsByCity(), ["city-counts"], {
        revalidate: 300,
      })();

  return (
    <Shell effective={effective} citySlug={citySlug} authFailed={authFailed}>
      <HomesSplit
        railDesktopOnly={!city}
        rail={
          <Suspense fallback={<RailSkeleton />}>
            <RailResults
              resultPromise={resultPromise}
              city={city}
              countyName={county?.name}
              basePath={basePath}
              qs={pagerQs}
              leadHelp={leadHelp}
              leadCitySlug={effective.citySlug}
              sourceNote={sourceNote}
            />
          </Suspense>
        }
        map={
          // real geographic map with price pins over the whole filtered
          // result set — fetches its own pins client-side, so it renders
          // in the streamed shell without waiting on the rail query
          <LiveMapPanel
            qs={searchFiltersToQueryString(effective)}
            activeCitySlug={effective.citySlug}
          />
        }
        extra={
          countsPromise ? (
            <Suspense fallback={<MobileIndexSkeleton />}>
              <MobileIndexSection countsPromise={countsPromise} />
            </Suspense>
          ) : undefined
        }
      />
      {/* the map shows live MLS pins within the streamed shell, so the
          compliance block may never be absent — the fallback renders the
          disclaimer + TREC links immediately, the resolve adds the stamp */}
      <Suspense fallback={<MLSComplianceFooter />}>
        <ComplianceSection resultPromise={resultPromise} />
      </Suspense>
    </Shell>
  );
}

/* Everything above the split — identical for both modes so live streaming
   can't drift visually from the blocking mock tree. */
function Shell({
  effective,
  citySlug,
  authFailed,
  children,
}: {
  effective: SearchFilters;
  citySlug?: string;
  authFailed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      <SearchNav />
      <div
        className="font-mono"
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
        <span>A FIELD GUIDE TO NORTH TEXAS REAL ESTATE</span>
        <span style={{ display: "flex", gap: 16 }}>
          <span>{cities.length} CITIES</span>
          <span style={{ color: "#D9481F" }} aria-hidden="true">✳</span>
          <span>{isLiveMls ? "LIVE MLS FEED — NTREIS" : "LIVE MLS FEED — PLACEHOLDER"}</span>
        </span>
      </div>

      <SearchToolbar query={effective} citySlug={citySlug} propertyTypes={PROPERTY_TYPE_OPTIONS} />

      {authFailed && (
        <div
          className="font-mono"
          role="alert"
          style={{
            textAlign: "center",
            padding: "10px 4vw",
            background: "#1D1913",
            color: "#E88D6B",
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: ".18em",
          }}
        >
          THAT SIGN-IN LINK DIDN&rsquo;T TAKE — LINKS ARE ONE-USE AND MUST OPEN IN THE SAME BROWSER
          THAT REQUESTED THEM. HIT SIGN IN (TOP RIGHT) FOR A FRESH ONE.
        </div>
      )}

      {/* mock-data notice — only when the live feed isn't wired */}
      {!isLiveMls && (
        <div
          className="font-mono"
          role="note"
          style={{
            textAlign: "center",
            padding: "9px 4vw",
            background: "rgba(217,72,31,.08)",
            borderBottom: "1.5px dashed rgba(217,72,31,.5)",
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: ".2em",
            color: "#C13E17",
          }}
        >
          SAMPLE INVENTORY — EVERY LISTING IS FICTIONAL UNTIL MLS APPROVAL &amp; THE LIVE IDX FEED
        </div>
      )}

      {children}
    </div>
  );
}

/* ---- streaming subcomponents (live mode) — each awaits a shared promise
   inside its own Suspense boundary; awaiting the same promise object twice
   never refires the query ---- */

async function RailResults({
  resultPromise,
  city,
  countyName,
  basePath,
  qs,
  leadHelp,
  leadCitySlug,
  sourceNote,
}: {
  resultPromise: Promise<SearchResult>;
  city?: City;
  countyName?: string;
  basePath: string;
  qs: string;
  leadHelp?: boolean;
  leadCitySlug?: string;
  sourceNote?: string;
}) {
  const result = await resultPromise;
  return (
    <>
      <ListingResultsRail result={result} city={city} countyName={countyName} sourceNote={sourceNote} />
      <Pager
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        basePath={basePath}
        qs={qs}
      />
      {leadHelp && <SearchHelpSlot citySlug={leadCitySlug} />}
    </>
  );
}

async function MobileIndexSection({
  countsPromise,
}: {
  countsPromise: Promise<Record<string, number>>;
}) {
  const counts = await countsPromise;
  return <MobileCitySearchIndex counts={counts} />;
}

/* Index-shaped placeholder while city counts stream — mirrors the
   MobileCitySearchIndex row silhouettes so the swap doesn't jump. */
function MobileIndexSkeleton() {
  return (
    <div
      className="mobile-only"
      style={{ padding: "18px 4vw 60px", width: "100%" }}
      aria-busy="true"
      aria-label="Loading the city index"
    >
      <div
        className="font-mono"
        style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".26em", color: "#C13E17" }}
      >
        PULLING THE INDEX…
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rail-skeleton-card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              height: 56,
              padding: "13px 2px",
              borderBottom: "1px solid rgba(29,25,19,.16)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  height: 16,
                  width: "44%",
                  borderRadius: 6,
                  background: "repeating-linear-gradient(45deg,#EFE7D6 0 12px,#E7DDC7 12px 24px)",
                }}
              />
              <div
                style={{
                  height: 9,
                  width: "68%",
                  borderRadius: 6,
                  background: "rgba(29,25,19,.08)",
                  marginTop: 6,
                }}
              />
            </div>
            <div
              style={{
                height: 24,
                width: 64,
                borderRadius: 999,
                background: "repeating-linear-gradient(45deg,#EFE7D6 0 12px,#E7DDC7 12px 24px)",
                border: "1.5px solid rgba(29,25,19,.25)",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

async function ComplianceSection({ resultPromise }: { resultPromise: Promise<SearchResult> }) {
  const result = await resultPromise;
  return <MLSComplianceFooter asOf={result.mlsLastUpdated} />;
}

/* Rail-shaped placeholder while the ledger streams in — same card
   silhouette as ListingCardLedger so the swap doesn't jump. */
function RailSkeleton() {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 18 }}
      aria-busy="true"
      aria-label="Loading listings"
    >
      <div
        className="font-mono"
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: ".26em",
          color: "#C13E17",
          borderBottom: "2px solid #1D1913",
          paddingBottom: 10,
        }}
      >
        PULLING THE LEDGER…
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rail-skeleton-card"
          style={{
            border: "2px solid #1D1913",
            borderRadius: 18,
            overflow: "hidden",
            background: "#FBF7EE",
          }}
        >
          <div
            style={{
              // 210 matches ListingCardLedger's photo box — no stream-swap jump
              height: 210,
              background: "repeating-linear-gradient(45deg,#EFE7D6 0 12px,#E7DDC7 12px 24px)",
            }}
          />
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
