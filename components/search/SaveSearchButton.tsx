"use client";
import type { SavedSearchFilter } from "@/lib/mls/types";
import { useShelf } from "@/lib/shelf";

/* "♡ SAVE THIS SEARCH" — members place a standing order; guests are sent
   to the account gate (searches only persist server-side). */
export default function SaveSearchButton({
  payload,
}: {
  payload: Omit<SavedSearchFilter, "id" | "createdAt">;
}) {
  const shelf = useShelf();
  const alreadySaved =
    shelf.ready && shelf.searches.some((s) => s.queryString === payload.queryString);

  return (
    <button
      type="button"
      onClick={() => {
        if (alreadySaved) return;
        shelf.saveSearch(payload); // gates guests internally
      }}
      className="btn-primary font-mono"
      title={alreadySaved ? "This search is already on your shelf" : undefined}
      style={{
        background: alreadySaved ? "#1D1913" : "#D9481F",
        color: "#F6F1E6",
        borderRadius: 999,
        padding: "11px 20px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: ".08em",
        border: `2px solid ${alreadySaved ? "#1D1913" : "#D9481F"}`,
        cursor: alreadySaved ? "default" : "pointer",
        marginLeft: "auto",
      }}
    >
      {alreadySaved ? "✓ SEARCH SAVED" : "♡ SAVE THIS SEARCH"}
    </button>
  );
}
