"use client";
import { useEffect, useRef, useState } from "react";
import type { SavedSearchFilter } from "@/lib/mls/types";
import { useShelf } from "@/lib/shelf";

/* "♡ SAVE THIS SEARCH" — members place a standing order; guests are sent
   to the account gate (searches only persist server-side). Shows SAVING…
   while the save settles so a double-tap can't file the order twice. */
export default function SaveSearchButton({
  payload,
}: {
  payload: Omit<SavedSearchFilter, "id" | "createdAt">;
}) {
  const shelf = useShelf();
  const alreadySaved =
    shelf.ready && shelf.searches.some((s) => s.queryString === payload.queryString);

  const [pending, setPending] = useState(false);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pending && alreadySaved) {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      setPending(false);
    }
  }, [pending, alreadySaved]);
  useEffect(() => {
    return () => {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, []);

  const handleSave = () => {
    if (alreadySaved || pending) return;
    if (shelf.account) {
      // optimistic save flips alreadySaved on the next render; the timeout
      // is a safety net so a failed save never wedges the button
      setPending(true);
      pendingTimer.current = setTimeout(() => setPending(false), 4000);
    }
    shelf.saveSearch(payload); // gates guests internally
  };

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={pending}
      className="btn-primary font-mono"
      title={alreadySaved ? "This search is already on your shelf" : undefined}
      style={{
        background: alreadySaved ? "#1D1913" : "#C13E17",
        color: "#F6F1E6",
        borderRadius: 999,
        padding: "13px 20px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: ".08em",
        border: `2px solid ${alreadySaved ? "#1D1913" : "#C13E17"}`,
        cursor: alreadySaved || pending ? "default" : "pointer",
        marginLeft: "auto",
        opacity: pending ? 0.7 : 1,
      }}
    >
      {pending ? "SAVING…" : alreadySaved ? "✓ SEARCH SAVED" : "♡ SAVE THIS SEARCH"}
    </button>
  );
}
