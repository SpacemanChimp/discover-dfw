import type { Metadata } from "next";
import SearchNav from "@/components/search/SearchNav";
import SavedSearchesDashboard from "@/components/account/SavedSearchesDashboard";

export const metadata: Metadata = {
  title: "Your Shelf — Saved Searches",
  robots: { index: false, follow: false },
};

export default function SavedSearchesPage() {
  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      <SearchNav />
      <SavedSearchesDashboard />
    </div>
  );
}
