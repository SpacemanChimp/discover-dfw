import type { Metadata } from "next";
import SearchNav from "@/components/search/SearchNav";
import SavedHomesDashboard from "@/components/account/SavedHomesDashboard";
import { isLiveMls } from "@/lib/mls";
import { mockListings } from "@/data/mock-listings";

export const metadata: Metadata = {
  title: "Your Shelf — Saved Homes",
  robots: { index: false, follow: false },
};

export default function SavedHomesPage() {
  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      <SearchNav />
      {/* live feed: saves resolve through /api/shelf-listings; mock keeps
          the static pool so the demo shelf still works offline */}
      {isLiveMls ? <SavedHomesDashboard live /> : <SavedHomesDashboard allListings={mockListings} />}
    </div>
  );
}
