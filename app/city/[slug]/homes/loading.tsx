import SearchNav from "@/components/search/SearchNav";
import LoadingState from "@/components/search/LoadingState";

export default function CityHomesLoading() {
  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      <SearchNav />
      <LoadingState />
    </div>
  );
}
