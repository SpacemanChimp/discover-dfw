import type { Metadata } from "next";
import SearchNav from "@/components/search/SearchNav";
import SavedHomesDashboard from "@/components/account/SavedHomesDashboard";
import { allMockListings } from "@/lib/listings/mock-provider";

export const metadata: Metadata = {
  title: "Your Shelf — Saved Homes",
  robots: { index: false, follow: false },
};

export default function SavedHomesPage() {
  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      <SearchNav />
      <SavedHomesDashboard allListings={allMockListings} />
    </div>
  );
}
