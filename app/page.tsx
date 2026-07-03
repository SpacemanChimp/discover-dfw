import { cities, counties } from "@/lib/dfw-data";
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

export default function Home() {
  return (
    <div
      id="top"
      style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}
    >
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
        <span style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <span>{cities.length} CITIES</span>
          <span style={{ color: "#D9481F" }}>✳</span>
          <span>{counties.length} COUNTIES</span>
          <span style={{ color: "#D9481F" }}>✳</span>
          <span>EST. MMXXVI</span>
        </span>
      </div>

      <Nav />
      <Hero />
      <Ticker />
      <InteractiveMap />
      <EditorsPicks />
      <StatsBand />
      <NewBuilds />
      <CityIndex />
      <About />
      <Newsletter />
      <Footer />
      <Reveals />
    </div>
  );
}
