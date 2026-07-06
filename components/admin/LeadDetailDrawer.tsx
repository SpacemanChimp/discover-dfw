"use client";
import { useState } from "react";
import Link from "next/link";
import { LEAD_STATUSES, type AdminLead, type LeadEvent } from "./AdminLeadList";
import LeadEventTimeline from "./LeadEventTimeline";

/* One lead, in full: contact, ask, links to the listing + city report,
   status pills (PATCH /api/admin/leads), and this listing's event trail. */
export default function LeadDetailDrawer({
  lead,
  events,
  onClose,
  onStatusChange,
}: {
  lead: AdminLead;
  events: LeadEvent[];
  onClose: () => void;
  onStatusChange: (status: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setStatus = async (status: string) => {
    if (status === lead.status || saving) return;
    setSaving(true);
    setErr(null);
    const prev = lead.status;
    onStatusChange(status); // optimistic
    try {
      const res = await fetch("/api/admin/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: lead.kind, id: lead.id, status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      onStatusChange(prev);
      setErr("Didn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const fact = (k: string, v: React.ReactNode) => (
    <div style={{ padding: "10px 0", borderBottom: "1px solid rgba(29,25,19,.13)" }}>
      <div className="font-mono" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".16em", color: "rgba(29,25,19,.5)" }}>
        {k}
      </div>
      <div style={{ fontSize: 14.5, marginTop: 3 }}>{v}</div>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Lead detail"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(29,25,19,.55)", display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#F6F1E6",
          borderLeft: "2px solid #1D1913",
          width: "min(520px, 94vw)",
          height: "100%",
          overflowY: "auto",
          padding: "22px 24px 40px",
          boxShadow: "-18px 0 44px rgba(20,16,10,.35)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span
            className="font-mono"
            style={{
              fontSize: 8.5,
              fontWeight: 700,
              letterSpacing: ".18em",
              borderRadius: 99,
              padding: "5px 10px",
              background: lead.kind === "showing" ? "#D9481F" : "#1D1913",
              color: "#F6F1E6",
            }}
          >
            {lead.kind === "showing" ? "SHOWING REQUEST" : "LISTING QUESTION"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ border: "1.5px solid #1D1913", borderRadius: 99, width: 30, height: 30, background: "#FBF7EE", cursor: "pointer", fontFamily: "inherit" }}
          >
            ✕
          </button>
        </div>

        <h2 className="font-serif" style={{ fontWeight: 900, fontSize: 26, margin: "14px 0 4px" }}>
          {lead.name}
        </h2>
        <div style={{ fontSize: 13.5, color: "rgba(29,25,19,.7)" }}>
          <a href={`mailto:${lead.email}`} style={{ color: "#D9481F" }}>{lead.email}</a>
          {lead.phone ? <> · <a href={`tel:${lead.phone}`} style={{ color: "#1D1913" }}>{lead.phone}</a></> : null}
        </div>

        {/* status pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "16px 0 4px" }}>
          {LEAD_STATUSES.map((s) => {
            const active = lead.status === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className="font-mono"
                style={{
                  border: "1.5px solid",
                  borderColor: active ? "#1D1913" : "rgba(29,25,19,.4)",
                  borderRadius: 99,
                  padding: "7px 12px",
                  fontSize: 8.5,
                  fontWeight: active ? 700 : 400,
                  letterSpacing: ".12em",
                  background: active ? "#1D1913" : "#FBF7EE",
                  color: active ? "#F6F1E6" : "rgba(29,25,19,.65)",
                  cursor: active ? "default" : "pointer",
                }}
              >
                {s.toUpperCase()}
              </button>
            );
          })}
        </div>
        {err && (
          <div className="font-mono" style={{ fontSize: 9, letterSpacing: ".1em", color: "#B3261E" }}>
            {err.toUpperCase()}
          </div>
        )}

        {fact(lead.kind === "showing" ? "REQUESTED" : "QUESTION", lead.summary)}
        {lead.message && fact("NOTE", lead.message)}
        {fact(
          "LISTING",
          <span style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href={`/listing/${lead.listingKey}`} style={{ color: "#D9481F", fontWeight: 700 }}>
              MLS# {lead.listingKey} →
            </Link>
            {lead.citySlug && (
              <Link href={`/city/${lead.citySlug}`} style={{ color: "#1D1913" }}>
                {lead.citySlug.replace(/-/g, " ")} city report →
              </Link>
            )}
          </span>
        )}
        {fact("ACCOUNT", lead.userEmail ? `Member — ${lead.userEmail}` : "Guest submission")}
        {fact(
          "RECEIVED",
          new Date(lead.createdAt).toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/Chicago",
          }) + " CT"
        )}

        <h3 className="font-serif" style={{ fontWeight: 800, fontSize: 17, margin: "22px 0 8px" }}>
          Activity on this listing.
        </h3>
        <LeadEventTimeline events={events} />
      </div>
    </div>
  );
}
