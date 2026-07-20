import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { funnelFromCounts, type EventName } from "@/lib/analytics/events";
import { gscConfigured, gscQuery, gscTotals, GSC_REQUIRED_ENV } from "@/lib/analytics/gsc";
import { pageInventory } from "@/lib/content/community-content-drafts";

/* Growth Command Center data — ONE admin read assembling the weekly
   operating view: GSC organic search (official API or an explicit
   not-connected state — never fabricated), the first-party site_events
   funnel + attribution, and content/letter operations. Aggregation
   happens here so the dashboard stays a renderer. */

export const dynamic = "force-dynamic";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: Request) {
  const adminUser = await getAdminUser();
  if (!adminUser) return NextResponse.json({ ok: false }, { status: 404 }); // don't advertise the surface
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });

  const url = new URL(req.url);
  const days = [7, 28, 90].includes(Number(url.searchParams.get("range"))) ? Number(url.searchParams.get("range")) : 28;
  const now = new Date();
  const from = new Date(now.getTime() - days * 86400_000);
  const prevFrom = new Date(now.getTime() - 2 * days * 86400_000);
  const fromIso = from.toISOString();
  const prevFromIso = prevFrom.toISOString();

  /* ---- first-party events (current + previous window, one query) ---- */
  const { data: evRows } = await db
    .from("site_events")
    .select("event, session_id, path, city_slug, intent, utm_source, utm_medium, utm_campaign, created_at")
    .gte("created_at", prevFromIso)
    .order("created_at", { ascending: false })
    .limit(40000);
  const evAll = evRows ?? [];
  const inRange = evAll.filter((e) => e.created_at >= fromIso);
  const inPrev = evAll.filter((e) => e.created_at < fromIso);

  const countBy = (rows: typeof evAll) => {
    const counts: Partial<Record<EventName, number>> = {};
    const sessions = new Set<string>();
    for (const e of rows) {
      counts[e.event as EventName] = (counts[e.event as EventName] ?? 0) + 1;
      sessions.add(e.session_id);
    }
    return { counts, sessions: sessions.size };
  };
  const cur = countBy(inRange);
  const prev = countBy(inPrev);

  const topN = (pairs: Map<string, number>, n = 10) =>
    [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  const srcMap = new Map<string, number>();
  const landMap = new Map<string, number>();
  const cityMap = new Map<string, number>();
  const intentMap = new Map<string, number>();
  const showMap = new Map<string, number>();
  const saveMap = new Map<string, number>();
  const leadPaths = new Set<string>();
  for (const e of inRange) {
    if (e.event === "lead_submitted") {
      bump(srcMap, [e.utm_source ?? "(direct)", e.utm_medium ?? "—", e.utm_campaign ?? "—"].join("§"));
      bump(landMap, e.path);
      if (e.city_slug) bump(cityMap, e.city_slug);
      if (e.intent) bump(intentMap, e.intent);
      leadPaths.add(e.path);
    }
    if (e.event === "showing_requested") {
      bump(showMap, e.path);
      leadPaths.add(e.path);
    }
    if (e.event === "saved_search_created") bump(saveMap, e.path);
  }

  /* ---- operational counts (current + previous windows) ---- */
  const dbc = db; // narrowed for the closures below
  const countSince = async (table: string, col: string, sinceIso: string, untilIso?: string) => {
    let q = dbc.from(table).select("id", { count: "exact", head: true }).gte(col, sinceIso);
    if (untilIso) q = q.lt(col, untilIso);
    const { count } = await q;
    return count ?? 0;
  };
  const [leadsCur, leadsPrev, showCur, showPrev, saveCur, savePrev, subsTotalRes, subsPendingRes, subsUnsubRes, subsGrowthCur, subsGrowthPrev] = await Promise.all([
    countSince("leads", "created_at", fromIso),
    countSince("leads", "created_at", prevFromIso, fromIso),
    countSince("showing_requests", "created_at", fromIso),
    countSince("showing_requests", "created_at", prevFromIso, fromIso),
    countSince("saved_searches", "created_at", fromIso),
    countSince("saved_searches", "created_at", prevFromIso, fromIso),
    db.from("letter_subscribers").select("id", { count: "exact", head: true }).eq("status", "subscribed"),
    db.from("letter_subscribers").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("letter_subscribers").select("id", { count: "exact", head: true }).eq("status", "unsubscribed"),
    db.from("letter_subscribers").select("id", { count: "exact", head: true }).eq("status", "subscribed").gte("created_at", fromIso),
    db.from("letter_subscribers").select("id", { count: "exact", head: true }).eq("status", "subscribed").gte("created_at", prevFromIso).lt("created_at", fromIso),
  ]);

  /* ---- Search Console (official API; explicit not-connected state) ---- */
  const gscEnd = new Date(now.getTime() - 2 * 86400_000); // GSC data lags ~2 days
  const gscStart = new Date(gscEnd.getTime() - days * 86400_000);
  const gscPrevStart = new Date(gscEnd.getTime() - 2 * days * 86400_000);
  let gsc: Record<string, unknown> = { connected: false, requiredEnv: GSC_REQUIRED_ENV, topPages: [], movers: [], queries: [], opportunities: [], pagesNoLeads: [], freshAsOf: null };
  let organic: { clicks: number; impressions: number; ctr: number; position: number } | null = null;
  let organicPrev: { clicks: number; impressions: number; ctr: number; position: number } | null = null;
  if (gscConfigured()) {
    const [pagesCur, pagesPrev, queriesCur] = await Promise.all([
      gscQuery({ startDate: iso(gscStart), endDate: iso(gscEnd), dimensions: ["page"], rowLimit: 250 }),
      gscQuery({ startDate: iso(gscPrevStart), endDate: iso(gscStart), dimensions: ["page"], rowLimit: 250 }),
      gscQuery({ startDate: iso(gscStart), endDate: iso(gscEnd), dimensions: ["query"], rowLimit: 250 }),
    ]);
    organic = gscTotals(pagesCur);
    organicPrev = gscTotals(pagesPrev);
    if (pagesCur) {
      const toPath = (u: string) => {
        try {
          return new URL(u).pathname;
        } catch {
          return u;
        }
      };
      const prevBy = new Map((pagesPrev ?? []).map((r) => [toPath(r.keys[0]), r.impressions]));
      const rows = pagesCur.map((r) => ({ page: toPath(r.keys[0]), clicks: Math.round(r.clicks), impressions: Math.round(r.impressions), ctr: Math.round(r.ctr * 1000) / 10, position: Math.round(r.position * 10) / 10 }));
      const movers = rows
        .map((r) => ({ page: r.page, impressions: r.impressions, prevImpressions: Math.round(prevBy.get(r.page) ?? 0), delta: r.impressions - Math.round(prevBy.get(r.page) ?? 0) }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 12);
      const queries = (queriesCur ?? []).map((r) => ({ query: r.keys[0], clicks: Math.round(r.clicks), impressions: Math.round(r.impressions), ctr: Math.round(r.ctr * 1000) / 10, position: Math.round(r.position * 10) / 10 }));
      gsc = {
        connected: true,
        requiredEnv: GSC_REQUIRED_ENV,
        topPages: rows.sort((a, b) => b.clicks - a.clicks).slice(0, 12),
        movers,
        queries: queries.sort((a, b) => b.clicks - a.clicks).slice(0, 12),
        opportunities: queries.filter((q) => q.impressions >= 100 && q.ctr < 1.5).sort((a, b) => b.impressions - a.impressions).slice(0, 12),
        pagesNoLeads: rows.filter((r) => r.impressions >= 100 && !leadPaths.has(r.page)).sort((a, b) => b.impressions - a.impressions).slice(0, 12),
        freshAsOf: iso(gscEnd),
      };
    }
  }

  /* ---- content operations ---- */
  const [draftsRes, cdReadyRes, pendCandRes, heroSlotsRes, bandsRes, pubEventsRes] = await Promise.all([
    db.from("community_drafts").select("city_slug, slug, name, lifecycle").neq("lifecycle", "archived"),
    db.from("community_content_drafts").select("id", { count: "exact", head: true }).eq("lifecycle", "ready"),
    db.from("photo_candidates").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("photo_slots").select("entity_slug, status").eq("entity_type", "neighborhood").eq("slot_key", "hero"),
    db.from("new_build_communities").select("city_slug, hood_slug, published"),
    db.from("verification_events").select("action, notes, created_at").eq("action", "publish").order("created_at", { ascending: false }).limit(8),
  ]);
  const drafts = draftsRes.data ?? [];
  const draftsByLifecycle: Record<string, number> = {};
  for (const d of drafts) draftsByLifecycle[d.lifecycle] = (draftsByLifecycle[d.lifecycle] ?? 0) + 1;
  const awaitingExport = drafts.filter((d) => d.lifecycle === "ready" || d.lifecycle === "exported").map((d) => ({ key: `${d.city_slug}/${d.slug}`, name: d.name }));
  const heroBySlug = new Map((heroSlotsRes.data ?? []).map((s) => [s.entity_slug as string, s.status as string]));
  const missingHero = pageInventory()
    .filter((p) => heroBySlug.get(`${p.citySlug}/${p.hoodSlug}`) !== "approved")
    .slice(0, 20)
    .map((p) => ({ key: `${p.citySlug}/${p.hoodSlug}`, name: p.hoodName }));
  const hiddenBands = (bandsRes.data ?? []).filter((b) => b.published !== true).length;

  /* ---- the letter ---- */
  const { data: latestIssue } = await db
    .from("letter_issues")
    .select("issue_date, status, sent_count, failed_count")
    .order("issue_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const pct = (leads: number, sessions: number) => (sessions ? Math.round((leads / sessions) * 1000) / 10 : 0);

  return NextResponse.json({
    ok: true,
    range: { days, from: fromIso.slice(0, 10), to: iso(now), prevFrom: prevFromIso.slice(0, 10), prevTo: fromIso.slice(0, 10) },
    summary: {
      organicClicks: organic?.clicks ?? null,
      organicImpressions: organic?.impressions ?? null,
      avgPosition: organic?.position ?? null,
      ctr: organic?.ctr ?? null,
      sessions: cur.sessions,
      leads: leadsCur,
      showings: showCur,
      savedSearches: saveCur,
      letterSubscribers: subsGrowthCur.count ?? 0,
      visitorToLeadPct: pct(leadsCur, cur.sessions),
      prev: {
        organicClicks: organicPrev?.clicks ?? null,
        organicImpressions: organicPrev?.impressions ?? null,
        avgPosition: organicPrev?.position ?? null,
        ctr: organicPrev?.ctr ?? null,
        sessions: prev.sessions,
        leads: leadsPrev,
        showings: showPrev,
        savedSearches: savePrev,
        letterSubscribers: subsGrowthPrev.count ?? 0,
        visitorToLeadPct: pct(leadsPrev, prev.sessions),
      },
    },
    gsc,
    funnel: funnelFromCounts(cur.counts),
    attribution: {
      bySource: topN(srcMap).map(([k, count]) => {
        const [source, medium, campaign] = k.split("§");
        return { source, medium, campaign, count };
      }),
      byLandingPage: topN(landMap).map(([path, count]) => ({ path, count })),
      byCity: topN(cityMap).map(([citySlug, count]) => ({ citySlug, count })),
      byIntent: topN(intentMap).map(([intent, count]) => ({ intent, count })),
      showingPages: topN(showMap).map(([path, count]) => ({ path, count })),
      savedSearchPages: topN(saveMap).map(([path, count]) => ({ path, count })),
      unattributed: Math.max(0, leadsCur - (cur.counts.lead_submitted ?? 0)),
    },
    content: {
      draftsByLifecycle,
      awaitingExport,
      missingHero,
      pendingCandidates: pendCandRes.count ?? 0,
      readySeoDrafts: cdReadyRes.count ?? 0,
      hiddenBands,
      recentPublications: (pubEventsRes.data ?? []).map((e) => ({ at: e.created_at as string, note: String(e.notes ?? "").slice(0, 120) })),
    },
    letter: {
      subscribed: subsTotalRes.count ?? 0,
      pending: subsPendingRes.count ?? 0,
      unsubscribed: subsUnsubRes.count ?? 0,
      growthInRange: subsGrowthCur.count ?? 0,
      latestIssue: latestIssue
        ? { issueDate: latestIssue.issue_date as string, status: latestIssue.status as string, sentCount: (latestIssue.sent_count as number) ?? 0, failedCount: (latestIssue.failed_count as number) ?? 0 }
        : null,
      engagement: null, // provider engagement data unavailable — the desk labels it
      nextIssueHref: "/admin/letter",
    },
  });
}
