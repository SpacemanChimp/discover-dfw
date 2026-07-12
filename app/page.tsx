import type { Metadata } from "next";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { isLiveMls } from "@/lib/mls";
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

export default function Home() {
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
      <Ticker />
      <InteractiveMap liveMls={isLiveMls} />
      <EditorsPicks />
      <StatsBand />
      <NewBuilds liveMls={isLiveMls} />
      <CityIndex />
      <About />
      <Newsletter />
      <Footer />
      <Reveals />
    </div>
  );
}
