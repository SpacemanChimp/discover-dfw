"use client";
import { useState } from "react";
import type { Listing } from "@/lib/mls/types";
import RequestShowingSheet from "@/components/search/RequestShowingSheet";
import AskQuestionSheet from "@/components/search/AskQuestionSheet";

/* The dossier's lead CTAs — sticky bar on mobile (see .dossier-ctas in
   globals.css). Sheets are live: they post to /api/leads (shipped Phase 1). */
export default function ListingLeadCTA({
  listing,
  cityName,
}: {
  listing: Listing;
  cityName: string;
}) {
  const [sheet, setSheet] = useState<"showing" | "question" | null>(null);
  return (
    <>
      <div className="dossier-ctas">
        <button
          type="button"
          onClick={() => setSheet("showing")}
          className="btn-primary"
          style={{
            flex: 1.4,
            background: "#C13E17",
            color: "#F6F1E6",
            borderRadius: 999,
            padding: "15px 0",
            textAlign: "center",
            fontWeight: 700,
            fontSize: 14,
            border: "2px solid #C13E17",
            boxShadow: "0 10px 22px rgba(217,72,31,.28)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Request a showing
        </button>
        <button
          type="button"
          onClick={() => setSheet("question")}
          style={{
            flex: 1,
            border: "2px solid #1D1913",
            borderRadius: 999,
            padding: "15px 0",
            textAlign: "center",
            fontWeight: 700,
            fontSize: 14,
            background: "#F6F1E6",
            color: "#1D1913",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Ask a question
        </button>
      </div>
      <RequestShowingSheet
        listing={listing}
        cityName={cityName}
        open={sheet === "showing"}
        onClose={() => setSheet(null)}
      />
      <AskQuestionSheet
        listing={listing}
        cityName={cityName}
        open={sheet === "question"}
        onClose={() => setSheet(null)}
      />
    </>
  );
}
