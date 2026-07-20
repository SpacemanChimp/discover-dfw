"use client";

/* The Growth Command Center — the weekly operating view. Strictly
   read-only: one GET per range change, no actions, no writes. Honest
   states everywhere — GSC figures render ONLY when the API says
   connected; nothing on this desk is ever fabricated. */

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const CARD = "#FBF7EE";
const ORANGE = "#D9481F";
const ORANGE_DARK = "#C13E17";
const GOOD = "#1F6B3A";
const MUTED = "rgba(29,25,19,.55)";
const RULE = "rgba(29,25,19,.15)";

/* ---- API contract (built in parallel to exactly this shape) ---- */

type GrowthData = {
  ok: true;
  range: { days: number; from: string; to: string; prevFrom: string; prevTo: string };
  summary: {
    organicClicks: number | null;
    organicImpressions: number | null;
    avgPosition: number | null;
    ctr: number | null; // null when GSC not connected
    sessions: number;
    leads: number;
    showings: number;
    savedSearches: number;
    letterSubscribers: number;
    visitorToLeadPct: number;
    prev: {
      organicClicks: number | null;
      organicImpressions: number | null;
      avgPosition: number | null;
      ctr: number | null;
      sessions: number;
      leads: number;
      showings: number;
      savedSearches: number;
      letterSubscribers: number;
      visitorToLeadPct: number;
    };
  };
  gsc: {
    connected: boolean;
    requiredEnv: string[];
    topPages: { page: string; clicks: number; impressions: number; ctr: number; position: number }[];
    movers: { page: string; impressions: number; prevImpressions: number; delta: number }[];
    queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
    opportunities: { query: string; impressions: number; ctr: number; position: number }[];
    pagesNoLeads: { page: string; clicks: number; impressions: number }[];
    freshAsOf: string | null;
  };
  funnel: { event: string; label: string; count: number; pctOfPrev: number | null }[];
  attribution: {
    bySource: { source: string; medium: string; campaign: string; count: number }[];
    byLandingPage: { path: string; count: number }[];
    byCity: { citySlug: string; count: number }[];
    byIntent: { intent: string; count: number }[];
    showingPages: { path: string; count: number }[];
    savedSearchPages: { path: string; count: number }[];
    unattributed: number;
  };
  content: {
    draftsByLifecycle: Record<string, number>;
    awaitingExport: { key: string; name: string }[];
    missingHero: { key: string; name: string }[];
    pendingCandidates: number;
    readySeoDrafts: number;
    hiddenBands: number;
    recentPublications: { at: string; note: string }[];
  };
  letter: {
    subscribed: number;
    pending: number;
    unsubscribed: number;
    growthInRange: number;
    latestIssue: { issueDate: string; status: string; sentCount: number; failedCount: number } | null;
    engagement: null; // provider engagement data unavailable — labelled so below
    nextIssueHref: string;
  };
};

type RangeDays = 7 | 28 | 90;

/* ---- formatting ---- */

const fmtInt = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US"));
const fmtPos = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1));
// GSC reports CTR as a fraction (0–1); tolerate an already-percent value too.
const fmtCtr = (v: number | null | undefined) => (v == null ? "—" : `${(v <= 1 ? v * 100 : v).toFixed(1)}%`);
const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1)}%`);
const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? `${s}T12:00:00Z` : s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

/* ---- small building blocks ---- */

function Delta({ cur, prev, invert = false }: { cur: number | null; prev: number | null; invert?: boolean }) {
  if (cur == null || prev == null || prev === 0) {
    return (
      <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: MUTED }}>
        — VS PREV
      </span>
    );
  }
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const flat = Math.abs(pct) < 0.05;
  const up = pct > 0;
  const good = invert ? !up : up; // avg position: down is good
  const color = flat ? MUTED : good ? GOOD : ORANGE_DARK;
  return (
    <span className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color }}>
      {flat ? "±0.0%" : `${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%`}
    </span>
  );
}

function NotConnectedChip() {
  return (
    <span
      className="font-mono"
      style={{
        fontSize: 8.5,
        fontWeight: 700,
        letterSpacing: ".12em",
        color: ORANGE_DARK,
        border: `1.5px solid ${ORANGE_DARK}`,
        borderRadius: 999,
        padding: "2px 7px",
        whiteSpace: "nowrap",
      }}
    >
      NOT CONNECTED
    </span>
  );
}

function Section({ eyebrow, right, children }: { eyebrow: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ border: `2px solid ${INK}`, background: CARD, borderRadius: 2, padding: "18px 20px", marginBottom: 20 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
          borderBottom: `2px solid ${INK}`,
          paddingBottom: 8,
          marginBottom: 14,
        }}
      >
        <span className="font-mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".22em", color: ORANGE }}>
          {eyebrow}
        </span>
        {right}
      </div>
      {children}
    </section>
  );
}

function MiniTable({
  title,
  headers,
  rows,
  empty,
}: {
  title: string;
  headers: string[];
  rows: ReactNode[][];
  empty?: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", marginBottom: 6, color: INK }}>
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="font-mono" style={{ fontSize: 10.5, color: MUTED, padding: "4px 0", letterSpacing: ".06em" }}>
          {empty ?? "NOTHING IN RANGE"}
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: `1.5px solid ${INK}`, background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={`${h}-${i}`}
                    className="font-mono"
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: ".1em",
                      textAlign: i === 0 ? "left" : "right",
                      padding: "6px 8px",
                      borderBottom: `2px solid ${INK}`,
                      whiteSpace: "nowrap",
                      color: INK,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td
                      key={ci}
                      style={{
                        fontSize: 12.5,
                        padding: "5px 8px",
                        borderBottom: ri === rows.length - 1 ? "none" : `1px solid ${RULE}`,
                        textAlign: ci === 0 ? "left" : "right",
                        whiteSpace: ci === 0 ? "normal" : "nowrap",
                        wordBreak: ci === 0 ? "break-all" : undefined,
                        color: INK,
                      }}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const chip: CSSProperties = {
  display: "inline-block",
  padding: "4px 10px",
  border: `1.5px solid ${INK}`,
  background: "#fff",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: ".1em",
  color: INK,
};

const quickLink: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: ".1em",
  color: INK,
  textDecoration: "none",
  border: `1.5px solid ${INK}`,
  background: "#fff",
  borderRadius: 2,
  padding: "6px 12px",
  display: "inline-block",
};

/* ---- the desk ---- */

export default function GrowthDesk() {
  const [rangeDays, setRangeDays] = useState<RangeDays>(28);
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/growth?range=${rangeDays}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null);
        if (!alive) return;
        const isOk = !!body && typeof body === "object" && (body as { ok?: unknown }).ok === true;
        if (!res.ok || !isOk) {
          const msg =
            body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
              ? (body as { error: string }).error
              : `request failed (HTTP ${res.status})`;
          setError(msg);
          setData(null);
        } else {
          setData(body as GrowthData);
        }
      })
      .catch((e: unknown) => {
        if (!alive || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : "network error");
        setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [rangeDays, reloadKey]);

  return (
    <main style={{ minHeight: "100vh", background: CREAM, color: INK, padding: "32px 20px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <header
          style={{
            borderBottom: `3px solid ${INK}`,
            paddingBottom: 12,
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, margin: 0, letterSpacing: "0.02em" }}>GROWTH COMMAND CENTER</h1>
            <p className="font-mono" style={{ margin: "6px 0 0", fontSize: 10, letterSpacing: ".1em", color: MUTED }}>
              {data
                ? `WINDOW ${fmtDate(data.range.from)} → ${fmtDate(data.range.to)} · COMPARED TO ${fmtDate(data.range.prevFrom)} → ${fmtDate(data.range.prevTo)}`
                : "ORGANIC SEARCH · FUNNEL · ATTRIBUTION · CONTENT OPS · THE LETTER"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {([7, 28, 90] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setRangeDays(d)}
                className="font-mono"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".12em",
                  padding: "6px 14px",
                  borderRadius: 999,
                  cursor: "pointer",
                  border: `1.5px solid ${INK}`,
                  background: rangeDays === d ? INK : "transparent",
                  color: rangeDays === d ? CREAM : INK,
                }}
              >
                {d}D
              </button>
            ))}
          </div>
        </header>

        {loading ? (
          <div className="font-mono" style={{ padding: "60px 0", textAlign: "center", fontSize: 12, fontWeight: 700, letterSpacing: ".22em", color: MUTED }}>
            MEASURING THE WEEK…
          </div>
        ) : error ? (
          <div style={{ border: `2px solid ${ORANGE_DARK}`, background: CARD, borderRadius: 2, padding: "20px 22px" }}>
            <div className="font-mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".16em", color: ORANGE_DARK }}>
              COULD NOT MEASURE
            </div>
            <p style={{ margin: "8px 0 14px", fontSize: 13.5, lineHeight: 1.6 }}>
              The growth endpoint did not answer cleanly: <span className="font-mono" style={{ fontSize: 12 }}>{error}</span>. Nothing on this
              desk is cached or guessed — until the request succeeds there are no numbers to show.
            </p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="font-mono"
              style={{
                padding: "8px 14px",
                border: `1.5px solid ${INK}`,
                background: INK,
                color: CREAM,
                fontSize: 11,
                letterSpacing: ".12em",
                fontWeight: 700,
                cursor: "pointer",
                borderRadius: 2,
              }}
            >
              RETRY
            </button>
          </div>
        ) : data ? (
          <GrowthSections data={data} />
        ) : null}

        <footer className="font-mono" style={{ marginTop: 8, fontSize: 9.5, letterSpacing: ".08em", color: MUTED, lineHeight: 1.9 }}>
          READ-ONLY VIEW · EVERY NUMBER COMES FROM /api/admin/growth · GSC FIGURES APPEAR ONLY WHEN SEARCH CONSOLE IS CONNECTED — NOTHING
          HERE IS EVER ESTIMATED OR INVENTED
        </footer>
      </div>
    </main>
  );
}

/* ---- sections ---- */

function GrowthSections({ data }: { data: GrowthData }) {
  const s = data.summary;
  const g = data.gsc;
  const a = data.attribution;
  const c = data.content;
  const l = data.letter;

  const tiles: {
    label: string;
    value: string;
    cur: number | null;
    prev: number | null;
    invert?: boolean;
    gscTile?: boolean;
    sub?: string;
  }[] = [
    { label: "ORGANIC CLICKS", value: fmtInt(s.organicClicks), cur: s.organicClicks, prev: s.prev.organicClicks, gscTile: true },
    { label: "ORGANIC IMPRESSIONS", value: fmtInt(s.organicImpressions), cur: s.organicImpressions, prev: s.prev.organicImpressions, gscTile: true },
    { label: "AVG POSITION", value: fmtPos(s.avgPosition), cur: s.avgPosition, prev: s.prev.avgPosition, invert: true, gscTile: true, sub: "LOWER IS BETTER" },
    { label: "SEARCH CTR", value: fmtCtr(s.ctr), cur: s.ctr, prev: s.prev.ctr, gscTile: true },
    { label: "FIRST-PARTY SESSIONS", value: fmtInt(s.sessions), cur: s.sessions, prev: s.prev.sessions },
    { label: "LEADS", value: fmtInt(s.leads), cur: s.leads, prev: s.prev.leads },
    { label: "SHOWING REQUESTS", value: fmtInt(s.showings), cur: s.showings, prev: s.prev.showings },
    { label: "SAVED SEARCHES", value: fmtInt(s.savedSearches), cur: s.savedSearches, prev: s.prev.savedSearches },
    {
      label: "LETTER SUBSCRIBERS",
      value: fmtInt(s.letterSubscribers),
      cur: s.letterSubscribers,
      prev: s.prev.letterSubscribers,
      sub: `${l.growthInRange >= 0 ? "+" : ""}${l.growthInRange} IN RANGE`,
    },
    { label: "VISITOR→LEAD", value: fmtPct(s.visitorToLeadPct), cur: s.visitorToLeadPct, prev: s.prev.visitorToLeadPct },
  ];

  const funnelMax = data.funnel.length > 0 ? Math.max(1, data.funnel[0].count) : 1;

  const editorHref = (key: string, tab: "photos" | "preview") =>
    `/admin/editor?mode=communities&community=${encodeURIComponent(key)}&tab=${tab}`;

  return (
    <>
      {/* A — EXECUTIVE SUMMARY */}
      <Section eyebrow="A — EXECUTIVE SUMMARY">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {tiles.map((t) => {
            const nc = t.gscTile && !g.connected;
            return (
              <div key={t.label} style={{ border: `1.5px solid ${INK}`, background: "#fff", borderRadius: 2, padding: "12px 14px" }}>
                <div className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".16em", color: MUTED }}>
                  {t.label}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{nc ? "—" : t.value}</span>
                  {nc ? <NotConnectedChip /> : <Delta cur={t.cur} prev={t.prev} invert={t.invert} />}
                </div>
                {t.sub && !nc ? (
                  <div className="font-mono" style={{ fontSize: 9, marginTop: 6, color: MUTED, letterSpacing: ".08em" }}>
                    {t.sub}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Section>

      {/* B — ORGANIC SEARCH */}
      <Section
        eyebrow="B — ORGANIC SEARCH"
        right={
          g.connected ? (
            <span className="font-mono" style={{ ...chip, borderColor: ORANGE, color: ORANGE_DARK }}>
              DATA FRESH AS OF {fmtDate(g.freshAsOf)} · GSC LAGS ~2 DAYS
            </span>
          ) : undefined
        }
      >
        {!g.connected ? (
          <div style={{ border: `2px solid ${ORANGE_DARK}`, background: "#fff", borderRadius: 2, padding: "16px 18px" }}>
            <div className="font-mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".18em", color: ORANGE_DARK }}>
              SEARCH CONSOLE NOT CONNECTED
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
              {g.requiredEnv.map((env) => (
                <code
                  key={env}
                  className="font-mono"
                  style={{ fontSize: 11, fontWeight: 700, border: `1.5px solid ${INK}`, padding: "4px 8px", borderRadius: 2, background: CREAM }}
                >
                  {env}
                </code>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
              Create a Google Cloud service account, enable the Search Console API, add the service-account email as a user on the
              sc-domain:discoverdfw.com property, then set these environment variables in Vercel.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 18 }}>
            <MiniTable
              title="TOP LANDING PAGES"
              headers={["PAGE", "CLICKS", "IMPR", "CTR", "POS"]}
              rows={g.topPages.map((p) => [p.page, fmtInt(p.clicks), fmtInt(p.impressions), fmtCtr(p.ctr), fmtPos(p.position)])}
            />
            <MiniTable
              title="GAINING / LOSING IMPRESSIONS"
              headers={["PAGE", "IMPR", "PREV", "Δ"]}
              rows={g.movers.map((m) => [
                m.page,
                fmtInt(m.impressions),
                fmtInt(m.prevImpressions),
                <span
                  key="d"
                  className="font-mono"
                  style={{ fontSize: 11, fontWeight: 700, color: m.delta > 0 ? GOOD : m.delta < 0 ? ORANGE_DARK : MUTED }}
                >
                  {m.delta > 0 ? "▲ " : m.delta < 0 ? "▼ " : ""}
                  {fmtInt(Math.abs(m.delta))}
                </span>,
              ])}
            />
            <MiniTable
              title="QUERIES GENERATING TRAFFIC"
              headers={["QUERY", "CLICKS", "IMPR", "CTR", "POS"]}
              rows={g.queries.map((q) => [q.query, fmtInt(q.clicks), fmtInt(q.impressions), fmtCtr(q.ctr), fmtPos(q.position)])}
            />
            <MiniTable
              title="OPPORTUNITIES — HIGH IMPRESSIONS, LOW CTR"
              headers={["QUERY", "IMPR", "CTR", "POS"]}
              rows={g.opportunities.map((o) => [o.query, fmtInt(o.impressions), fmtCtr(o.ctr), fmtPos(o.position)])}
            />
            <MiniTable
              title="PAGES WITH IMPRESSIONS BUT NO LEADS"
              headers={["PAGE", "CLICKS", "IMPR"]}
              rows={g.pagesNoLeads.map((p) => [p.page, fmtInt(p.clicks), fmtInt(p.impressions)])}
            />
          </div>
        )}
      </Section>

      {/* C — CONVERSION FUNNEL */}
      <Section eyebrow="C — CONVERSION FUNNEL">
        {data.funnel.length === 0 ? (
          <div className="font-mono" style={{ fontSize: 10.5, color: MUTED, letterSpacing: ".06em" }}>
            NOTHING IN RANGE
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {data.funnel.map((f) => {
              const width = Math.max(f.count > 0 ? 2 : 0, Math.min(100, (f.count / funnelMax) * 100));
              return (
                <div
                  key={f.event}
                  style={{ display: "grid", gridTemplateColumns: "200px 1fr 200px", gap: 12, alignItems: "center" }}
                >
                  <span className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em" }}>
                    {f.label.toUpperCase()}
                  </span>
                  <div style={{ background: "#fff", border: `1.5px solid ${INK}`, borderRadius: 2, height: 20, overflow: "hidden" }}>
                    <div style={{ width: `${width}%`, height: "100%", background: ORANGE }} />
                  </div>
                  <span className="font-mono" style={{ fontSize: 10.5, letterSpacing: ".04em", textAlign: "right" }}>
                    <strong>{fmtInt(f.count)}</strong>
                    {f.pctOfPrev != null ? <span style={{ color: MUTED }}> · {f.pctOfPrev.toFixed(1)}% OF PREVIOUS</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* D — LEAD ATTRIBUTION */}
      <Section
        eyebrow="D — LEAD ATTRIBUTION"
        right={
          <span className="font-mono" style={{ ...chip, borderColor: ORANGE_DARK, color: ORANGE_DARK }}>
            UNATTRIBUTED: {fmtInt(a.unattributed)} LEADS (NO MATCHING SESSION EVENTS)
          </span>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 18 }}>
          <MiniTable
            title="BY SOURCE / MEDIUM / CAMPAIGN"
            headers={["SOURCE", "MEDIUM", "CAMPAIGN", "LEADS"]}
            rows={a.bySource.map((r) => [r.source, <span key="m">{r.medium}</span>, <span key="c">{r.campaign}</span>, fmtInt(r.count)])}
          />
          <MiniTable title="BY LANDING PAGE" headers={["PATH", "LEADS"]} rows={a.byLandingPage.map((r) => [r.path, fmtInt(r.count)])} />
          <MiniTable title="BY CITY" headers={["CITY", "LEADS"]} rows={a.byCity.map((r) => [r.citySlug, fmtInt(r.count)])} />
          <MiniTable title="BY INTENT" headers={["INTENT", "LEADS"]} rows={a.byIntent.map((r) => [r.intent, fmtInt(r.count)])} />
          <MiniTable
            title="SHOWING-REQUEST PAGES"
            headers={["PATH", "REQUESTS"]}
            rows={a.showingPages.map((r) => [r.path, fmtInt(r.count)])}
          />
          <MiniTable
            title="SAVED-SEARCH PAGES"
            headers={["PATH", "SAVES"]}
            rows={a.savedSearchPages.map((r) => [r.path, fmtInt(r.count)])}
          />
        </div>
      </Section>

      {/* E — CONTENT OPERATIONS */}
      <Section eyebrow="E — CONTENT OPERATIONS">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {Object.entries(c.draftsByLifecycle).length === 0 ? (
            <span className="font-mono" style={{ fontSize: 10.5, color: MUTED, letterSpacing: ".06em" }}>
              NO DRAFTS ON THE BOARD
            </span>
          ) : (
            Object.entries(c.draftsByLifecycle).map(([stage, n]) => (
              <span key={stage} className="font-mono" style={chip}>
                {stage.toUpperCase()}: {fmtInt(n)}
              </span>
            ))
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 18, marginBottom: 16 }}>
          <div>
            <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", marginBottom: 6 }}>
              AWAITING EXPORT
            </div>
            {c.awaitingExport.length === 0 ? (
              <div className="font-mono" style={{ fontSize: 10.5, color: MUTED, letterSpacing: ".06em" }}>
                NOTHING WAITING
              </div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {c.awaitingExport.map((item) => (
                  <li key={item.key} style={{ borderBottom: `1px solid ${RULE}`, padding: "5px 0" }}>
                    <a href={editorHref(item.key, "preview")} style={{ color: INK, fontSize: 13, textDecoration: "underline" }}>
                      {item.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", marginBottom: 6 }}>
              MISSING HERO PHOTO
            </div>
            {c.missingHero.length === 0 ? (
              <div className="font-mono" style={{ fontSize: 10.5, color: MUTED, letterSpacing: ".06em" }}>
                EVERY PAGE HAS ITS HERO
              </div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {c.missingHero.map((item) => (
                  <li key={item.key} style={{ borderBottom: `1px solid ${RULE}`, padding: "5px 0" }}>
                    <a href={editorHref(item.key, "photos")} style={{ color: INK, fontSize: 13, textDecoration: "underline" }}>
                      {item.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", marginBottom: 6 }}>
              RECENT PUBLICATIONS
            </div>
            {c.recentPublications.length === 0 ? (
              <div className="font-mono" style={{ fontSize: 10.5, color: MUTED, letterSpacing: ".06em" }}>
                NOTHING PUBLISHED IN RANGE
              </div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {c.recentPublications.map((p, i) => (
                  <li key={`${p.at}-${i}`} style={{ borderBottom: `1px solid ${RULE}`, padding: "5px 0", fontSize: 13, lineHeight: 1.5 }}>
                    <span className="font-mono" style={{ fontSize: 10, color: MUTED, letterSpacing: ".06em" }}>
                      {fmtDate(p.at)}
                    </span>{" "}
                    — {p.note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href="/admin/photos" className="font-mono" style={quickLink}>
            {fmtInt(c.pendingCandidates)} PENDING PHOTO CANDIDATES →
          </a>
          <a href="/admin/communities?view=content" className="font-mono" style={quickLink}>
            {fmtInt(c.readySeoDrafts)} READY SEO DRAFTS →
          </a>
          <a href="/admin/newbuilds" className="font-mono" style={quickLink}>
            {fmtInt(c.hiddenBands)} HIDDEN INVENTORY BANDS →
          </a>
        </div>
      </Section>

      {/* F — THE LETTER */}
      <Section eyebrow="F — THE LETTER">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 14 }}>
          {(
            [
              ["SUBSCRIBED", l.subscribed],
              ["PENDING", l.pending],
              ["UNSUBSCRIBED", l.unsubscribed],
            ] as const
          ).map(([label, n]) => (
            <div key={label} style={{ border: `1.5px solid ${INK}`, background: "#fff", borderRadius: 2, padding: "12px 14px" }}>
              <div className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".16em", color: MUTED }}>
                {label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6, lineHeight: 1 }}>{fmtInt(n)}</div>
            </div>
          ))}
          <div style={{ border: `1.5px solid ${INK}`, background: "#fff", borderRadius: 2, padding: "12px 14px" }}>
            <div className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".16em", color: MUTED }}>
              GROWTH IN RANGE
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                marginTop: 6,
                lineHeight: 1,
                color: l.growthInRange > 0 ? GOOD : l.growthInRange < 0 ? ORANGE_DARK : INK,
              }}
            >
              {l.growthInRange >= 0 ? "+" : ""}
              {fmtInt(l.growthInRange)}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          {l.latestIssue ? (
            <span className="font-mono" style={chip}>
              LATEST ISSUE {fmtDate(l.latestIssue.issueDate)} · {l.latestIssue.status.toUpperCase()} · {fmtInt(l.latestIssue.sentCount)}{" "}
              SENT / {fmtInt(l.latestIssue.failedCount)} FAILED
            </span>
          ) : (
            <span className="font-mono" style={{ ...chip, color: MUTED, borderColor: MUTED }}>
              NO ISSUES YET
            </span>
          )}
          <span className="font-mono" style={{ ...chip, color: MUTED }}>
            ENGAGEMENT: PROVIDER DATA NOT AVAILABLE — NO INVENTED OPENS/CLICKS
          </span>
        </div>

        <a
          href={l.nextIssueHref}
          className="font-mono"
          style={{
            display: "inline-block",
            padding: "10px 16px",
            border: `1.5px solid ${INK}`,
            background: INK,
            color: CREAM,
            fontSize: 11,
            letterSpacing: ".12em",
            fontWeight: 700,
            textDecoration: "none",
            borderRadius: 2,
          }}
        >
          {"EDIT NEXT SUNDAY'S ISSUE →"}
        </a>
      </Section>
    </>
  );
}
