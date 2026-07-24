import { Suspense } from "react";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getMlsProvider, isLiveMls, PROPERTY_TYPE_OPTIONS } from "@/lib/mls";
import type { SearchFilters, SearchResult } from "@/lib/mls/types";
import { searchFiltersToQueryString } from "@/lib/mls/url";
import {
  FEATURES,
  FEATURE_SLUGS,
  featurePath,
  applyFeaturePremise,
  publishedCitiesFor,
  publishedFeaturesForCity,
  type FeatureSlug,
} from "@/lib/mls/feature-search";
import { FEATURE_GUIDES, FEATURE_FAQS, cityFeatureBlurb } from "./feature-content";
import { bySlug, countyById } from "@/lib/dfw-data";
import { SITE_URL } from "@/lib/site";
import SearchNav from "./SearchNav";
import SearchToolbar from "./SearchToolbar";
import Pager from "./Pager";
import ListingResultsRail from "./ListingResultsRail";
import LiveMapPanel from "./LiveMapPanel";
import MLSComplianceFooter from "./MLSComplianceFooter";
import HomesSplit from "./HomesSplit";
import SaveSearchButton from "./SaveSearchButton";
import LastUpdatedStamp from "@/components/compliance/LastUpdatedStamp";

/* "/homes/<feature>" and "/homes/<feature>/<city>" — the feature searches.
   One parameterized room instead of six page shells: it reuses the Map
   Room's toolbar + rail + live map (never a second engine) and FORCES the
   feature predicates server-side on every request, so a hand-edited URL
   can never render inventory that fails the page's advertised filter.
   City pages additionally force the canonical city. Below the search:
   the hand-written buyer guide, related searches, a concise FAQ, and ONE
   save-search conversion band. Live mode streams the shell first, exactly
   like MapRoom/LandRoom/NewBuildsRoom. */
export default async function FeatureRoom({
  feature,
  citySlug,
  query,
  view = "map",
}: {
  feature: FeatureSlug;
  citySlug?: string;
  query: SearchFilters;
  view?: "list" | "map";
}) {
  const def = FEATURES[feature];
  const provider = getMlsProvider();
  const city = citySlug ? bySlug[citySlug] : undefined;
  // BOTH predicates forced AFTER user params: the feature premise (booleans
  // forced, numerics as a FLOOR so stricter user filters still narrow) and,
  // on city pages, the canonical city always win over URL tampering.
  const effective: SearchFilters = { ...query };
  applyFeaturePremise(effective, def.filters);
  if (citySlug) effective.citySlug = citySlug;
  const basePath = featurePath(feature, citySlug);
  const pagerQs = searchFiltersToQueryString(effective, !!citySlug);
  const h1 = city ? def.h1City(city.name) : def.h1;
  const countyName = city ? (countyById[city.county]?.name ?? city.county) : null;

  const below = (
    <FeatureBelow
      feature={feature}
      citySlug={citySlug}
      cityName={city?.name}
      blurb={city && countyName ? cityFeatureBlurb(feature, city, countyName) : null}
      savePayload={{
        query: effective,
        citySlug,
        label: h1,
        queryString: pagerQs,
      }}
    />
  );

  if (!isLiveMls) {
    const result = await provider.searchListings(effective);
    return (
      <Shell feature={feature} asOf={result.mlsLastUpdated} h1={h1} intro={<Intro def={def} city={city?.name} />}>
        <SearchToolbar
          query={effective}
          citySlug={citySlug}
          propertyTypes={PROPERTY_TYPE_OPTIONS}
          basePath={basePath}
          lockFilters={def.filters}
          lockLabel={def.chip}
        />
        <HomesSplit
          initialView={view}
          rail={
            <>
              <ListingResultsRail result={result} statuses={effective.statuses} />
              <ItemListJsonLd result={result} pageUrl={`${SITE_URL}${basePath}`} name={h1} />
              <Pager total={result.total} page={result.page} pageSize={result.pageSize} basePath={basePath} qs={pagerQs} />
            </>
          }
          map={<LiveMapPanel qs={searchFiltersToQueryString(effective)} basePath={basePath} />}
        />
        {below}
        <MLSComplianceFooter asOf={result.mlsLastUpdated} />
      </Shell>
    );
  }

  const resultPromise = unstable_cache(
    () => provider.searchListings(effective),
    ["feature-search", feature, citySlug ?? "", searchFiltersToQueryString(effective), String(effective.page ?? 1)],
    { revalidate: 120 }
  )();

  return (
    <Shell
      feature={feature}
      h1={h1}
      intro={<Intro def={def} city={city?.name} />}
      freshness={
        <Suspense fallback={null}>
          <FreshnessStamp resultPromise={resultPromise} />
        </Suspense>
      }
    >
      <SearchToolbar
        query={effective}
        citySlug={citySlug}
        propertyTypes={PROPERTY_TYPE_OPTIONS}
        basePath={basePath}
        lockFilters={def.filters}
        lockLabel={def.chip}
      />
      <HomesSplit
        initialView={view}
        rail={
          <Suspense fallback={<RailSkeleton />}>
            <RailResults resultPromise={resultPromise} qs={pagerQs} statuses={effective.statuses} basePath={basePath} pageUrl={`${SITE_URL}${basePath}`} name={h1} />
          </Suspense>
        }
        map={<LiveMapPanel qs={searchFiltersToQueryString(effective)} basePath={basePath} />}
      />
      {below}
      <Suspense fallback={<MLSComplianceFooter />}>
        <ComplianceSection resultPromise={resultPromise} />
      </Suspense>
    </Shell>
  );
}

function Shell({
  feature,
  asOf,
  freshness,
  h1,
  intro,
  children,
}: {
  feature: FeatureSlug;
  asOf?: string;
  freshness?: React.ReactNode;
  h1: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="homes-shell" style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      <SearchNav active="homes" />
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
        <span>{FEATURES[feature].chip} — STRUCTURED MLS FIELDS ONLY</span>
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
      <div style={{ padding: "18px 4vw 6px", maxWidth: 900 }}>
        <h1 className="font-serif" style={{ margin: 0, fontWeight: 900, fontSize: "clamp(22px,2.9vw,32px)", lineHeight: 1.08 }}>
          {h1}
        </h1>
        {intro}
      </div>
      {children}
    </div>
  );
}

function Intro({ def, city }: { def: (typeof FEATURES)[FeatureSlug]; city?: string }) {
  return (
    <p style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.55, color: "rgba(29,25,19,.72)", maxWidth: 720 }}>
      {def.fieldNote} {city ? `Results are limited to ${city} listings.` : "Results span the full DFW coverage area."} The
      count below is matching on-market listings, which includes active, under-contract, coming-soon, and pending homes.
    </p>
  );
}

async function RailResults({
  resultPromise,
  qs,
  statuses,
  basePath,
  pageUrl,
  name,
}: {
  resultPromise: Promise<SearchResult>;
  qs: string;
  statuses?: SearchFilters["statuses"];
  basePath: string;
  pageUrl: string;
  name: string;
}) {
  const result = await resultPromise;
  return (
    <>
      <ListingResultsRail result={result} statuses={statuses} />
      <ItemListJsonLd result={result} pageUrl={pageUrl} name={name} />
      <Pager total={result.total} page={result.page} pageSize={result.pageSize} basePath={basePath} qs={qs} />
    </>
  );
}

/* ItemList of the VISIBLE listings on this page — emitted next to the rail
   from the same result object, so structured data can never disagree with
   what renders. Honest and minimal: position, listing URL, address name. */
function ItemListJsonLd({ result, pageUrl, name }: { result: SearchResult; pageUrl: string; name: string }) {
  if (!result.listings.length) return null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url: pageUrl,
    numberOfItems: result.listings.length,
    itemListElement: result.listings.map((l, i) => ({
      "@type": "ListItem",
      position: (result.page - 1) * result.pageSize + i + 1,
      url: `${SITE_URL}/listing/${l.listingKey}`,
      name: l.unparsedAddress || `Listing ${l.listingKey}`,
    })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
}

/* Everything below the split: guide, related searches, FAQ, ONE CTA. */
function FeatureBelow({
  feature,
  citySlug,
  cityName,
  blurb,
  savePayload,
}: {
  feature: FeatureSlug;
  citySlug?: string;
  cityName?: string;
  blurb: string | null;
  savePayload: { query: SearchFilters; citySlug?: string; label: string; queryString: string };
}) {
  const guide = FEATURE_GUIDES[feature];
  const faqs = FEATURE_FAQS[feature];
  const def = FEATURES[feature];

  // related links: sibling features (same city when published, else metro),
  // this feature's published cities, and the two standing searches
  const cityFeatures = citySlug ? publishedFeaturesForCity(citySlug).filter((f) => f !== feature) : [];
  const featureCities = publishedCitiesFor(feature).filter((c) => c !== citySlug).slice(0, 8);
  const otherMetro = FEATURE_SLUGS.filter((f) => f !== feature).slice(0, 5);

  const linkStyle: React.CSSProperties = {
    border: "1.5px solid rgba(29,25,19,.35)",
    borderRadius: 999,
    padding: "7px 14px",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: ".12em",
    textDecoration: "none",
    color: "#1D1913",
    background: "#FBF7EE",
    whiteSpace: "nowrap" as const,
  };

  return (
    <div style={{ padding: "34px 4vw 10px", maxWidth: 980 }}>
      {blurb && (
        <p style={{ fontSize: 14.5, lineHeight: 1.7, color: "rgba(29,25,19,.8)", maxWidth: 760, marginTop: 0 }}>{blurb}</p>
      )}

      <h2 className="font-serif" style={{ fontWeight: 800, fontSize: 22, margin: "26px 0 10px" }}>{guide.heading}</h2>
      {guide.paragraphs.map((p, i) => (
        <p key={i} style={{ fontSize: 14.5, lineHeight: 1.7, color: "rgba(29,25,19,.8)", maxWidth: 760 }}>{p}</p>
      ))}

      {/* the ONE conversion CTA on this page */}
      <div
        style={{
          border: "2px solid #1D1913",
          borderRadius: 14,
          background: "#FBF7EE",
          padding: "18px 20px",
          margin: "26px 0",
          display: "flex",
          gap: 14,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between",
          maxWidth: 760,
        }}
      >
        <div>
          <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".22em", color: "#C13E17" }}>
            NEW MATCHES BY EMAIL
          </div>
          <div style={{ fontSize: 14.5, lineHeight: 1.5, marginTop: 4 }}>
            Save this search and get new {cityName ? `${cityName} ` : "DFW "}matches as they list.
          </div>
        </div>
        <SaveSearchButton
          payload={{
            name: savePayload.label,
            filters: { ...savePayload.query, citySlug: savePayload.citySlug },
            citySlug: savePayload.citySlug,
            queryLabel: savePayload.label,
            queryString: savePayload.queryString,
            frequency: "daily",
            emailEnabled: true,
          }}
        />
      </div>

      <h2 className="font-serif" style={{ fontWeight: 800, fontSize: 20, margin: "26px 0 10px" }}>Related searches</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 860 }}>
        {citySlug && cityName && (
          <Link href={`/city/${citySlug}/homes`} className="font-mono" style={linkStyle}>
            ALL {cityName.toUpperCase()} HOMES
          </Link>
        )}
        {cityFeatures.map((f) => (
          <Link key={f} href={featurePath(f, citySlug)} className="font-mono" style={linkStyle}>
            {cityName?.toUpperCase()} {FEATURES[f].chip}
          </Link>
        ))}
        {featureCities.map((c) => (
          <Link key={c} href={featurePath(feature, c)} className="font-mono" style={linkStyle}>
            {(bySlug[c]?.name ?? c).toUpperCase()} {def.chip}
          </Link>
        ))}
        {!citySlug &&
          otherMetro.map((f) => (
            <Link key={f} href={featurePath(f)} className="font-mono" style={linkStyle}>
              DFW {FEATURES[f].chip}
            </Link>
          ))}
        <Link href="/land" className="font-mono" style={linkStyle}>DFW LAND</Link>
        <Link href="/new-builds" className="font-mono" style={linkStyle}>NEW BUILDS</Link>
        <Link href="/homes/features" className="font-mono" style={linkStyle}>ALL FEATURE SEARCHES</Link>
      </div>

      <h2 className="font-serif" style={{ fontWeight: 800, fontSize: 20, margin: "28px 0 6px" }}>Questions buyers ask</h2>
      <dl style={{ maxWidth: 760, margin: 0 }}>
        {faqs.map((f) => (
          <div key={f.q} style={{ borderTop: "1px solid rgba(29,25,19,.18)", padding: "12px 0" }}>
            <dt style={{ fontWeight: 700, fontSize: 14.5 }}>{f.q}</dt>
            <dd style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.65, color: "rgba(29,25,19,.75)" }}>{f.a}</dd>
          </div>
        ))}
      </dl>
    </div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }} aria-busy="true" aria-label="Loading matching listings">
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
