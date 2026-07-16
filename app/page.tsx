import type { Metadata } from "next";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { isLiveMls } from "@/lib/mls";
import { getAllCityMarketMetricSets } from "@/lib/market/metrics";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Ticker from "@/components/Ticker";
import InteractiveMap from "@/components/InteractiveMap";
import EditorsPicks from "@/components/EditorsPicks";
import StatsBand from "@/components/StatsBand";
import NewBuilds from "@/components/NewBuilds";
import CityIndex from "@/components/CityIndex";
import About from "@/components/About";
import Newsletter from "@/components/Newsletter";
import Footer from "@/components/Footer";
import Reveals from "@/components/Reveals";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/* Homepage market figures come from the canonical metric layer (same
   source as city reports and search) — ISR keeps them on the sync cadence. */
export const revalidate = 900;

/* SearchAction mirrors the REAL hero search (it routes to /homes?q=…) —
   never declare schema the page can't actually do. */
const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description:
      "A living atlas of Dallas–Fort Worth real estate — every city, every county, one clickable map.",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/homes?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    description: "An editorial field guide to Dallas–Fort Worth real estate.",
    areaServed: "Dallas–Fort Worth metroplex, Texas",
  },
];

export default async function Home() {
  /* One canonical read feeds Ticker, the map, StatsBand, and CityIndex —
     no surface keeps its own copy of a market number (see
     docs/market-data-methodology.md). Editorial fallback per city when a
     snapshot is missing; a total read failure degrades to all-editorial. */
  const marketSets = await getAllCityMarketMetricSets();
  const priceBySlug: Record<string, number> = {};
  const statsBySlug: Record<string, { ppsf?: number; dom?: number }> = {};
  let live = 0;
  let liveAsOf = "";
  for (const [slug, set] of Object.entries(marketSets)) {
    const m = set.metrics.median_active_list_price;
    if (m) priceBySlug[slug] = m.value;
    statsBySlug[slug] = {
      ppsf: set.metrics.median_price_per_sqft?.value,
      dom: set.metrics.median_days_on_market?.value,
    };
    if (set.sourceType === "mls_replica") {
      live++;
      if (set.asOf > liveAsOf) liveAsOf = set.asOf;
    }
  }
  const pricesLive = live > 0;
  const pricesAsOf = pricesLive ? liveAsOf : undefined;

  return (
    <div
      id="top"
      style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* masthead bar */}
      <div
        className="font-mono"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "center",
          padding: "9px 4vw",
          borderBottom: "1px solid rgba(29,25,19,.16)",
          fontSize: 10,
          letterSpacing: ".22em",
          color: "rgba(29,25,19,.55)",
        }}
      >
        <span>A FIELD GUIDE TO NORTH TEXAS REAL ESTATE</span>
      </div>

      <Nav />
      <Hero />
      <Ticker prices={priceBySlug} />
      <InteractiveMap
        liveMls={isLiveMls}
        prices={priceBySlug}
        stats={statsBySlug}
        pricesLive={pricesLive}
        pricesAsOf={pricesAsOf}
      />
      <EditorsPicks />
      <StatsBand prices={priceBySlug} pricesLive={pricesLive} pricesAsOf={pricesAsOf} />
      <NewBuilds liveMls={isLiveMls} />
      <CityIndex prices={priceBySlug} pricesLive={pricesLive} pricesAsOf={pricesAsOf} />
      <About />
      <Newsletter />
      <Footer />
      <Reveals />
    </div>
  );
}
