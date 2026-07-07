"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SavedSearchFilter } from "@/lib/mls/types";
import { useShelf } from "@/lib/shelf";
import SavedSearchFrequencySelector from "./SavedSearchFrequencySelector";

/* One standing order: name, the query line, cadence pills, email switch,
   RUN and REMOVE. REMOVE is a two-tap confirm — first tap arms it for ~3s. */
export default function SavedSearchCard({ search }: { search: SavedSearchFilter }) {
  const shelf = useShelf();
  const runHref = search.queryString ? `/homes?${search.queryString}` : "/homes";

  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);
  const handleRemove = () => {
    if (confirming) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      shelf.removeSearch(search.id);
      return;
    }
    setConfirming(true);
    confirmTimer.current = setTimeout(() => setConfirming(false), 3000);
  };

  return (
    <article style={{ border: "2px solid #1D1913", borderRadius: 15, background: "#FBF7EE", padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div className="font-serif" style={{ fontWeight: 800, fontSize: 16.5, lineHeight: 1.25 }}>
          {search.name}
        </div>
        {search.citySlug && (
          <span
            className="font-mono"
            style={{
              border: "1.5px solid #1D1913",
              borderRadius: 99,
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: ".14em",
              padding: "4px 9px",
              whiteSpace: "nowrap",
            }}
          >
            {search.citySlug.replace(/-/g, " ").toUpperCase()}
          </span>
        )}
      </div>
      <div className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".1em", color: "rgba(29,25,19,.62)", marginTop: 6 }}>
        {search.queryLabel.toUpperCase()}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginTop: 11,
          borderTop: "1px solid rgba(29,25,19,.14)",
          paddingTop: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <SavedSearchFrequencySelector
            value={search.frequency}
            onChange={(frequency) => shelf.updateSearch(search.id, { frequency })}
          />
          <button
            type="button"
            onClick={() => shelf.updateSearch(search.id, { emailEnabled: !search.emailEnabled })}
            aria-pressed={search.emailEnabled}
            className="font-mono"
            title="Email alerts for this search (arriving in a later phase)"
            style={{
              border: `1.5px solid ${search.emailEnabled ? "#D9481F" : "rgba(29,25,19,.4)"}`,
              borderRadius: 99,
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: ".12em",
              padding: "12px 12px",
              background: search.emailEnabled ? "rgba(217,72,31,.08)" : "transparent",
              color: search.emailEnabled ? "#C13E17" : "rgba(29,25,19,.62)",
              cursor: "pointer",
            }}
          >
            ✉ EMAIL {search.emailEnabled ? "ON" : "OFF"}
          </button>
        </div>
        <span className="font-mono" style={{ display: "flex", gap: 18, alignItems: "center", fontSize: 8.5, fontWeight: 700, letterSpacing: ".12em" }}>
          <button
            type="button"
            onClick={handleRemove}
            aria-label={confirming ? "Tap again to remove this saved search" : "Remove this saved search"}
            style={{
              color: confirming ? "#C13E17" : "rgba(29,25,19,.62)",
              background: "none",
              border: "none",
              cursor: "pointer",
              font: "inherit",
              letterSpacing: "inherit",
              padding: "12px 8px",
            }}
          >
            {confirming ? "SURE? REMOVE" : "REMOVE"}
          </button>
          <Link href={runHref} style={{ color: "#C13E17", textDecoration: "none", padding: "12px 8px" }}>
            RUN →
          </Link>
        </span>
      </div>
    </article>
  );
}
