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

/** Latest snapshot row per city, plus (when present) the row closest to one
    year before it — a single query serves both. */
async function readSnapshotRows(
  slugs: string[]
): Promise<Map<string, { latest: SnapshotRow; prevYear: SnapshotRow | null }>> {
  const out = new Map<string, { latest: SnapshotRow; prevYear: SnapshotRow | null }>();
  const db = getSupabaseAdmin();
  if (!db) return out;
  const { data, error } = await db
    .from("city_market_snapshots")
    .select("city_slug, as_of, active_listings, median_list_price, price_per_sqft, median_days_on_market, created_at")
    .in("city_slug", slugs)
    .order("as_of", { ascending: false })
    .limit(20000);
  if (error || !data) return out;
  const bySlugRows = new Map<string, SnapshotRow[]>();
  for (const r of data) {
    const list = bySlugRows.get(r.city_slug) ?? [];
    list.push(r);
    bySlugRows.set(r.city_slug, list);
  }
  for (const [slug, rows] of bySlugRows) {
    const latest = rows[0];
    const target = Date.parse(latest.as_of) - 365 * 86_400_000;
    let prevYear: SnapshotRow | null = null;
    let bestDelta = Infinity;
    for (const r of rows) {
      const delta = Math.abs(Date.parse(r.as_of) - target);
      if (delta < bestDelta) {
        bestDelta = delta;
        prevYear = r;
      }
    }
    // only comparable when genuinely ~a year apart (core re-validates too)
    if (prevYear && bestDelta > 15 * 86_400_000) prevYear = null;
    out.set(slug, { latest, prevYear });
  }
  return out;
}

/** Canonical metric set for one city. */
export async function getCityMarketMetricSet(citySlug: string): Promise<CityMarketMetricSet | null> {
  const c = bySlug[citySlug];
  if (!c) return null;
  try {
    if (REPLICA_MODE) {
      const rows = await readSnapshotRows([citySlug]);
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
      rows = await readSnapshotRows(cities.map((c) => c.slug));
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
