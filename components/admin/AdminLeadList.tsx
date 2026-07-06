"use client";
import { useMemo, useState } from "react";
import LeadDetailDrawer from "./LeadDetailDrawer";
import LeadEventTimeline from "./LeadEventTimeline";

/* The Lead Desk list — every showing request and question, filterable,
   with the shelf-engagement table and the recent event trail below.
   Plain and functional; the editorial theatrics stay on the public site. */

export interface AdminLead {
  kind: "showing" | "question";
  id: string;
  listingKey: string;
  citySlug: string | null;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  createdAt: string;
  summary: string;
  message: string | null;
  userEmail: string | null;
}

export interface LeadEvent {
  eventType: string;
  listingKey: string | null;
  citySlug: string | null;
  sourcePage: string;
  createdAt: string;
  userEmail: string | null;
  metadata: Record<string, unknown>;
}

export interface ShelfCount {
  email: string;
  savedHomes: number;
  savedSearches: number;
}

export const LEAD_STATUSES = ["new", "contacted", "scheduled", "closed"] as const;

const mono: React.CSSProperties = { fontFamily: "var(--font-mono, Menlo, monospace)" };
const label: React.CSSProperties = {
  ...mono,
  fontSize: 8.5,
  fontWeight: 700,
  letterSpacing: ".16em",
  color: "rgba(29,25,19,.55)",
};
const select: React.CSSProperties = {
  border: "1.5px solid #1D1913",
  borderRadius: 8,
  padding: "7px 9px",
  background: "#FBF7EE",
  fontSize: 12,
  fontFamily: "inherit",
  color: "#1D1913",
};

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });

export default function AdminLeadList({
  adminEmail,
  leads: initialLeads,
  events,
  shelfCounts,
}: {
  adminEmail: string;
  leads: AdminLead[];
  events: LeadEvent[];
  shelfCounts: ShelfCount[];
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [openId, setOpenId] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [city, setCity] = useState("");
  const [listing, setListing] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const cities = useMemo(
    () => [...new Set(leads.map((l) => l.citySlug).filter(Boolean))].sort() as string[],
    [leads]
  );

  const filtered = leads.filter((l) => {
    if (kind && l.kind !== kind) return false;
    if (status && l.status !== status) return false;
    if (city && l.citySlug !== city) return false;
    if (listing && !l.listingKey.includes(listing.trim())) return false;
    if (from && l.createdAt < from) return false;
    if (to && l.createdAt > to + "T23:59:59Z") return false;
    return true;
  });

  const open = leads.find((l) => l.id === openId) ?? null;

  const setLeadStatus = (id: string, next: string) =>
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: next } : l)));

  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh", padding: "26px 4vw 80px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 className="font-serif" style={{ margin: 0, fontWeight: 900, fontSize: "clamp(28px,4vw,38px)" }}>
            The lead desk.
          </h1>
          <span style={{ ...label }}>INTERNAL · {adminEmail.toUpperCase()}</span>
        </div>

        {/* filters */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 18 }}>
          <div>
            <div style={label}>TYPE</div>
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={select} aria-label="Lead type">
              <option value="">All</option>
              <option value="showing">Showing requests</option>
              <option value="question">Questions</option>
            </select>
          </div>
          <div>
            <div style={label}>STATUS</div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={select} aria-label="Status">
              <option value="">All</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={label}>CITY</div>
            <select value={city} onChange={(e) => setCity(e.target.value)} style={select} aria-label="City">
              <option value="">All</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={label}>LISTING (MLS KEY)</div>
            <input value={listing} onChange={(e) => setListing(e.target.value)} placeholder="1176…" style={{ ...select, width: 110 }} aria-label="Listing key" />
          </div>
          <div>
            <div style={label}>FROM</div>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={select} aria-label="From date" />
          </div>
          <div>
            <div style={label}>TO</div>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={select} aria-label="To date" />
          </div>
          <span style={{ ...label, paddingBottom: 8 }}>
            {filtered.length} OF {leads.length}
          </span>
        </div>

        {/* lead list */}
        <div style={{ border: "2px solid #1D1913", borderRadius: 14, background: "#FBF7EE", marginTop: 14, overflow: "hidden" }}>
          {filtered.length === 0 && (
            <div style={{ padding: "34px 0", textAlign: "center", color: "rgba(29,25,19,.55)", fontSize: 14 }}>
              Nothing matches — widen the filters.
            </div>
          )}
          {filtered.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setOpenId(l.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "12px 16px",
                border: "none",
                borderBottom: "1px solid rgba(29,25,19,.13)",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                color: "#1D1913",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span
                    style={{
                      ...mono,
                      fontSize: 8,
                      fontWeight: 700,
                      letterSpacing: ".14em",
                      borderRadius: 99,
                      padding: "4px 8px",
                      background: l.kind === "showing" ? "#D9481F" : "#1D1913",
                      color: "#F6F1E6",
                    }}
                  >
                    {l.kind === "showing" ? "SHOWING" : "QUESTION"}
                  </span>
                  <b style={{ fontSize: 14 }}>{l.name}</b>
                  <span style={{ fontSize: 12.5, color: "rgba(29,25,19,.6)" }}>{l.email}</span>
                </span>
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span
                    style={{
                      ...mono,
                      fontSize: 8,
                      fontWeight: 700,
                      letterSpacing: ".12em",
                      border: "1.5px solid",
                      borderColor: l.status === "new" ? "#D9481F" : "rgba(29,25,19,.4)",
                      color: l.status === "new" ? "#D9481F" : "rgba(29,25,19,.6)",
                      borderRadius: 99,
                      padding: "3px 8px",
                    }}
                  >
                    {l.status.toUpperCase()}
                  </span>
                  <span style={{ ...label }}>{fmtWhen(l.createdAt).toUpperCase()}</span>
                </span>
              </div>
              <div style={{ fontSize: 13, color: "rgba(29,25,19,.75)", marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.summary}
              </div>
              <div style={{ ...label, marginTop: 4 }}>
                MLS# {l.listingKey}
                {l.citySlug ? ` · ${l.citySlug.replace(/-/g, " ").toUpperCase()}` : ""}
                {l.userEmail ? " · MEMBER" : " · GUEST"}
              </div>
            </button>
          ))}
        </div>

        {/* shelf engagement */}
        <h2 className="font-serif" style={{ fontWeight: 800, fontSize: 22, margin: "34px 0 10px" }}>
          Shelves in play.
        </h2>
        <div style={{ border: "2px solid #1D1913", borderRadius: 14, background: "#FBF7EE", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, padding: "9px 16px", borderBottom: "1.5px solid #1D1913" }}>
            <span style={label}>ACCOUNT</span>
            <span style={label}>SAVED HOMES</span>
            <span style={label}>SAVED SEARCHES</span>
          </div>
          {shelfCounts.length === 0 && (
            <div style={{ padding: "22px 0", textAlign: "center", color: "rgba(29,25,19,.55)", fontSize: 13.5 }}>
              No member shelves yet.
            </div>
          )}
          {shelfCounts.map((s) => (
            <div key={s.email} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, padding: "10px 16px", borderBottom: "1px solid rgba(29,25,19,.12)", fontSize: 13 }}>
              <span>{s.email}</span>
              <span style={{ ...mono, fontSize: 12, textAlign: "right", minWidth: 90 }}>{s.savedHomes}</span>
              <span style={{ ...mono, fontSize: 12, textAlign: "right", minWidth: 100 }}>{s.savedSearches}</span>
            </div>
          ))}
        </div>

        {/* recent events */}
        <h2 className="font-serif" style={{ fontWeight: 800, fontSize: 22, margin: "34px 0 10px" }}>
          Recent lead events.
        </h2>
        <LeadEventTimeline events={events} />
      </div>

      {open && (
        <LeadDetailDrawer
          lead={open}
          events={events.filter((e) => e.listingKey === open.listingKey)}
          onClose={() => setOpenId(null)}
          onStatusChange={(next) => setLeadStatus(open.id, next)}
        />
      )}
    </div>
  );
}
