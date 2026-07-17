"use client";
import SearchTypeahead from "@/components/search/SearchTypeahead";

/* Homepage hero search — one prominent field-guide pill that routes into the
   Map Room via the shared typeahead (cities, neighborhoods, communities,
   schools, live addresses; saved data when signed in). The old native
   <datalist> is gone — no more unstyled browser dropdown. */
export default function HeroSearch() {
  return (
    // relative + z-index so the open suggestion dropdown paints ABOVE the
    // Hero's later siblings (the "Explore the map" / index CTAs)
    <div style={{ position: "relative", zIndex: 30, width: "min(620px, 92vw)", marginTop: 30, animation: "fadeUp .8s ease .68s both" }}>
      <SearchTypeahead size="hero" placeholder="Search a city, neighborhood, school, address, or ZIP" />
    </div>
  );
}
