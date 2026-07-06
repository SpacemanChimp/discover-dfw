"use client";
import type { LeadEvent } from "./AdminLeadList";

/* Chronological trail of lead_events — submissions, email sends/failures.
   Used full-width on the desk and filtered inside the detail drawer. */

const TAG: Record<string, { label: string; color: string }> = {
  showing_request: { label: "SHOWING REQUEST", color: "#D9481F" },
  listing_question: { label: "QUESTION", color: "#1D1913" },
  email_sent: { label: "EMAIL SENT", color: "#2E7D4F" },
  email_failed: { label: "EMAIL FAILED", color: "#B3261E" },
};

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });

export default function LeadEventTimeline({ events }: { events: LeadEvent[] }) {
  if (!events.length)
    return (
      <div
        style={{
          border: "2px dashed rgba(29,25,19,.3)",
          borderRadius: 14,
          padding: "24px 0",
          textAlign: "center",
          color: "rgba(29,25,19,.55)",
          fontSize: 13.5,
        }}
      >
        No events yet.
      </div>
    );

  return (
    <div style={{ border: "2px solid #1D1913", borderRadius: 14, background: "#FBF7EE", overflow: "hidden" }}>
      {events.map((e, i) => {
        const tag = TAG[e.eventType] ?? { label: e.eventType.toUpperCase(), color: "rgba(29,25,19,.6)" };
        const meta = e.metadata as { category?: string; to?: string; error?: string; dryRun?: boolean };
        const detail =
          e.eventType.startsWith("email")
            ? [meta.category, meta.to, meta.dryRun ? "dry run" : null, meta.error].filter(Boolean).join(" · ")
            : [e.sourcePage, e.userEmail ? `member ${e.userEmail}` : "guest"].filter(Boolean).join(" · ");
        return (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "9px 16px", borderBottom: "1px solid rgba(29,25,19,.12)" }}>
            <span
              className="font-mono"
              style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".12em", color: tag.color, minWidth: 118 }}
            >
              {tag.label}
            </span>
            <span style={{ fontSize: 12.5, color: "rgba(29,25,19,.75)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {e.listingKey ? `MLS# ${e.listingKey}` : ""}
              {e.citySlug ? ` · ${e.citySlug}` : ""}
              {detail ? ` · ${detail}` : ""}
            </span>
            <span className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".1em", color: "rgba(29,25,19,.5)", whiteSpace: "nowrap" }}>
              {fmtWhen(e.createdAt).toUpperCase()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
