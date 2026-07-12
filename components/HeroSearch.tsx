"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cities } from "@/lib/dfw-data";
import { searchFiltersToQueryString } from "@/lib/mls/url";

/* Homepage hero search — one prominent field-guide pill that routes into
   the Map Room. An exact city name becomes a city-scoped search
   (?city=slug, same param the toolbar emits); anything else rides the
   existing keyword param (?q=…). No new search behavior — this is a door,
   not a second engine. */

export default function HeroSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  const go = () => {
    const v = value.trim();
    if (!v) {
      router.push("/homes");
      return;
    }
    const hit = cities.find((c) => c.name.toLowerCase() === v.toLowerCase());
    const qs = hit
      ? searchFiltersToQueryString({ citySlug: hit.slug })
      : searchFiltersToQueryString({ q: v });
    router.push(qs ? `/homes?${qs}` : "/homes");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      role="search"
      aria-label="Search DFW homes"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "min(620px, 92vw)",
        marginTop: 30,
        padding: "8px 8px 8px 22px",
        background: "#FBF7EE",
        border: "2px solid #1D1913",
        borderRadius: 999,
        boxShadow: "0 14px 30px rgba(29,25,19,.12)",
        animation: "fadeUp .8s ease .68s both",
      }}
    >
      <svg viewBox="0 0 20 20" style={{ width: 17, height: 17, flexShrink: 0 }} aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="6" fill="none" stroke="#1D1913" strokeWidth="2" />
        <line x1="13" y1="13" x2="18" y2="18" stroke="#1D1913" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        list="hero-cities"
        placeholder="Search a city, neighborhood, ZIP, or address"
        aria-label="Search a city, neighborhood, ZIP, or address"
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          outline: "none",
          background: "transparent",
          fontSize: 16,
          fontWeight: 600,
          fontFamily: "inherit",
          color: "#1D1913",
        }}
      />
      <datalist id="hero-cities">
        {cities.map((c) => (
          <option key={c.slug} value={c.name} />
        ))}
      </datalist>
      <button
        type="submit"
        className="btn-primary"
        style={{
          background: "#D9481F",
          color: "#F6F1E6",
          border: "2px solid #D9481F",
          borderRadius: 999,
          padding: "12px 26px",
          fontWeight: 700,
          fontSize: 14.5,
          letterSpacing: ".03em",
          fontFamily: "inherit",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Search
      </button>
    </form>
  );
}
