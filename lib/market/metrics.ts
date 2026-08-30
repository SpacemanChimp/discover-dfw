/* Canonical market metrics — SERVER BINDING. Every surface that displays a
   market number gets it from here (rule: one authoritative value per metric
   and period, no parallel static copies).

   Source resolution, in order:
   - MLS_PROVIDER local/database → latest city_market_snapshots row(s) read
     directly from the NTREIS replica (verified, sourceName NTREIS). YoY is
     attached only when a comparable row ~1 year older exists.
   - MLS_PROVIDER trestle → per-city provider snapshot (live API medians).
     Bulk surfaces (homepage) fall back to editorial in this mode — 90
     parallel API calls per render would breach feed etiquette.
   - otherwise (mock/unset) → editorial fallback set (verified: false).

   Never throws: any failure degrades to the editorial fallback so a feed
   hiccup can't break a page. The IDX provider contract is untouched. */
import "server-only";
import { cities, bySlug } from "@/lib/dfw-data";
import { getMlsProvider, isLiveMls } from "@/lib/mls";
import { getSupabaseAdmin } from "@/lib/db/admin";
import {
  metricsFromEditorial,
  metricsFromSnapshotRow,
  type CityMarketMetricSet,
  type SnapshotRow,
} from "./core";

export * from "./core";

const REPLICA_MODE = ["local", "database"].includes(process.env.MLS_PROVIDER ?? "");

function editorialSet(slug: string): CityMarketMetricSet | null {
  const c = bySlug[slug];
  return c ? metricsFromEditorial(c) : null;
}

/* ---------------------------------------------------------------------------
   Snapshot reads — ONE consistent, retried read per server process.

   The launch audit caught two defects here (hardening, 2026-08-30):
   1. NON-DETERMINISTIC BUILDS: every statically prerendered city page made
      its own single-city query; under the ~90-page build fan-out a handful
      of those reads failed and fell back to editorial values, so the SAME
      city could show different medians on different surfaces of one build
      (the audit's 16 "median differs across surfaces" findings). Fix: all
      callers share one memoized all-cities read with bounded retries —
      one build, one snapshot, every surface agrees. If every retry fails
      the WHOLE read fails closed to the labeled editorial set uniformly;
      an editorial value is never mixed with replica values in one build.
   2. SILENT 1,000-ROW CAP: the old read trusted .limit(20000), but
      PostgREST caps every response at 1,000 rows, so bulk reads never saw
      the year-old rows and homepage YoY silently vanished. Fix: two
      BOUNDED window queries (latest week, plus the 350–380-day-old band),
      each paged under the cap.
--------------------------------------------------------------------------- */

const RETRIES = 3;
const RETRY_DELAY_MS = 350;
const MEMO_TTL_MS = 5 * 60_000;

let snapshotMemo: { at: number; promise: Promise<Map<string, { latest: SnapshotRow; prevYear: SnapshotRow | null }>> } | null = null;

const SNAPSHOT_SELECT =
  "city_slug, as_of, active_listings, median_list_price, price_per_sqft, median_days_on_market, created_at";

type SlugSnapshotRow = SnapshotRow & { city_slug: string };

async function pagedWindow(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  fromISO: string,
  toISO: string
): Promise<SlugSnapshotRow[]> {
  const rows: SlugSnapshotRow[] = [];
  for (let from = 0; from < 10_000; from += 1000) {
    const { data, error } = await db
      .from("city_market_snapshots")
      .select(SNAPSHOT_SELECT)
      .gte("as_of", fromISO)
      .lte("as_of", toISO)
      .order("as_of", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as SlugSnapshotRow[]));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

async function readAllSnapshotRows(): Promise<Map<string, { latest: SnapshotRow; prevYear: SnapshotRow | null }>> {
  const out = new Map<string, { latest: SnapshotRow; prevYear: SnapshotRow | null }>();
  const db = getSupabaseAdmin();
  if (!db) return out;
  const day = 86_400_000;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const now = Date.now();
  // latest = newest row per city within the last 14 days (sync is daily);
  // prevYear = the row closest to 365 days before that, from a ±15d band
  const recent = await pagedWindow(db, iso(now - 14 * day), iso(now + day));
  const yearBand = await pagedWindow(db, iso(now - 381 * day), iso(now - 349 * day));
  const oldBySlug = new Map<string, SlugSnapshotRow[]>();
  for (const r of yearBand) {
    const list = oldBySlug.get(r.city_slug) ?? [];
    list.push(r);
    oldBySlug.set(r.city_slug, list);
  }
  for (const r of recent) {
    if (out.has(r.city_slug)) continue; // newest-first: first row wins
    const target = Date.parse(r.as_of) - 365 * day;
    let prevYear: SnapshotRow | null = null;
    let bestDelta = Infinity;
    for (const old of oldBySlug.get(r.city_slug) ?? []) {
      const delta = Math.abs(Date.parse(old.as_of) - target);
      if (delta < bestDelta) {
        bestDelta = delta;
        prevYear = old;
      }
    }
    // only comparable when genuinely ~a year apart (core re-validates too)
    if (prevYear && bestDelta > 15 * day) prevYear = null;
    out.set(r.city_slug, { latest: r, prevYear });
  }
  return out;
}

function allSnapshotRows(): Promise<Map<string, { latest: SnapshotRow; prevYear: SnapshotRow | null }>> {
  if (snapshotMemo && Date.now() - snapshotMemo.at < MEMO_TTL_MS) return snapshotMemo.promise;
  const at = Date.now();
  const promise = (async () => {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      try {
        return await readAllSnapshotRows();
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
    // total failure: drop the memo so the next caller retries, and fail
    // closed — an EMPTY map sends every surface to the labeled editorial
    // set together (uniform), never a per-city mix
    snapshotMemo = null;
    console.warn(`[market-metrics] snapshot read failed after ${RETRIES} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
    return new Map<string, { latest: SnapshotRow; prevYear: SnapshotRow | null }>();
  })();
  snapshotMemo = { at, promise };
  return promise;
}

/** Canonical metric set for one city. */
export async function getCityMarketMetricSet(citySlug: string): Promise<CityMarketMetricSet | null> {
  const c = bySlug[citySlug];
  if (!c) return null;
  try {
    if (REPLICA_MODE) {
      const rows = await allSnapshotRows();
      const hit = rows.get(citySlug);
      if (hit) return metricsFromSnapshotRow(c, hit.latest, hit.prevYear);
      return editorialSet(citySlug);
    }
    if (isLiveMls) {
      // trestle: live API medians via the provider (contract unchanged)
      const snap = await getMlsProvider().getCityMarketSnapshot(citySlug);
      if (snap && snap.medianListPrice > 0) {
        return metricsFromSnapshotRow(c, {
          as_of: snap.asOf.slice(0, 10),
          active_listings: snap.activeListings,
          median_list_price: snap.medianListPrice,
          price_per_sqft: snap.pricePerSqft,
          median_days_on_market: snap.medianDaysOnMarket,
          created_at: snap.asOf,
        });
      }
    }
  } catch {
    /* fall through to editorial */
  }
  return editorialSet(citySlug);
}

/** Canonical metric sets for every city — one query in replica mode. Used by
    the homepage (Ticker, CityIndex, StatsBand, InteractiveMap). Cities with
    no snapshot get the editorial fallback so the index never has holes. */
export async function getAllCityMarketMetricSets(): Promise<Record<string, CityMarketMetricSet>> {
  const out: Record<string, CityMarketMetricSet> = {};
  let rows = new Map<string, { latest: SnapshotRow; prevYear: SnapshotRow | null }>();
  if (REPLICA_MODE) {
    try {
      rows = await allSnapshotRows();
    } catch {
      rows = new Map();
    }
  }
  for (const c of cities) {
    const hit = rows.get(c.slug);
    out[c.slug] = hit ? metricsFromSnapshotRow(c, hit.latest, hit.prevYear) : metricsFromEditorial(c);
  }
  return out;
}
