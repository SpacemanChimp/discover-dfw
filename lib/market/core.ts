/* Canonical city market metrics — PURE CORE (no env, no DB, no server-only).
   Single model + single set of builders/formatters for every surface that
   shows a market number: homepage (Ticker/CityIndex/StatsBand/InteractiveMap),
   city reports, the listing "vs city median" module, and the city home-search
   mini snapshot. The server binding (lib/market/metrics.ts) supplies data.

   Authoritative source: the NTREIS replica's city_market_snapshots table
   (app/api/mls/sync computes it — full paged scan per city, standard_status
   'Active', matched on the MLS "City" field, median of list prices; $/sqft
   and DOM only when the underlying fields are genuinely present).

   Editorial dataset values (lib/dfw.data.json price/ppsf/dom) are the
   FALLBACK ONLY — they are snapshot-seeded copies refreshed by
   scripts/content/refresh-city-market-figures.mjs, never a second truth.

   Methodology, definitions, cadence: docs/market-data-methodology.md.
   Unit-tested by scripts/tests/market-metrics.test.mjs. */

export type MetricType =
  | "median_active_list_price"
  | "median_days_on_market"
  | "active_listing_count"
  | "median_price_per_sqft"
  | "yoy_median_list_price_change";

export type MetricUnit = "usd" | "usd_per_sqft" | "days" | "listings" | "percent";
export type SourceType = "mls_replica" | "editorial";

export interface CityMarketMetric {
  /** City identifier — this app's stable city id IS the slug. */
  cityId: string;
  citySlug: string;
  metricType: MetricType;
  value: number;
  unit: MetricUnit;
  sourceName: string;
  sourceType: SourceType;
  /** The date the value describes (snapshot as_of / editorial seed date). */
  asOf: string;
  /** Point-in-time inventory metrics: period == asOf day. YoY: year span. */
  periodStart: string;
  periodEnd: string;
  geographyDefinition: string;
  propertyScope: string;
  listingStatusScope: string;
  calculationMethod: string;
  /** true only for values read from the NTREIS replica snapshot. */
  verified: boolean;
  lastUpdatedAt: string;
}

export interface CityMarketMetricSet {
  cityId: string;
  citySlug: string;
  cityName: string;
  sourceType: SourceType;
  sourceName: string;
  asOf: string;
  metrics: Partial<Record<MetricType, CityMarketMetric>>;
}

/* Shared scope descriptions — must match app/api/mls/sync reality. */
export const GEOGRAPHY_DEF = 'Listings whose MLS "City" field equals the city name';
export const PROPERTY_SCOPE = "Residential, residential-income & land listings (rentals excluded)";
export const STATUS_SCOPE = "Active";
export const SOURCE_NTREIS = "NTREIS";
export const SOURCE_EDITORIAL = "Discover DFW editorial dataset (seeded from NTREIS snapshot medians)";

/* Bump when scripts/content/refresh-city-market-figures.mjs is re-run. */
export const EDITORIAL_DATASET_AS_OF = "2026-07-15";

const METHODS: Record<MetricType, { unit: MetricUnit; method: string }> = {
  median_active_list_price: { unit: "usd", method: "Median of current list prices across all matching active listings" },
  median_days_on_market: { unit: "days", method: "Median of MLS CumulativeDaysOnMarket across all matching active listings" },
  active_listing_count: { unit: "listings", method: "Count of all matching active listings" },
  median_price_per_sqft: { unit: "usd_per_sqft", method: "Median of per-listing list price ÷ living area, listings with both values only" },
  yoy_median_list_price_change: { unit: "percent", method: "Percent change of median active list price vs the snapshot closest to one year prior" },
};

interface CityRef {
  slug: string;
  name: string;
}

function metric(
  city: CityRef,
  type: MetricType,
  value: number,
  src: { sourceType: SourceType; sourceName: string; asOf: string; lastUpdatedAt: string },
  period?: { start: string; end: string }
): CityMarketMetric {
  return {
    cityId: city.slug,
    citySlug: city.slug,
    metricType: type,
    value,
    unit: METHODS[type].unit,
    sourceName: src.sourceName,
    sourceType: src.sourceType,
    asOf: src.asOf,
    periodStart: period?.start ?? src.asOf,
    periodEnd: period?.end ?? src.asOf,
    geographyDefinition: GEOGRAPHY_DEF,
    propertyScope: PROPERTY_SCOPE,
    listingStatusScope: STATUS_SCOPE,
    calculationMethod: METHODS[type].method,
    verified: src.sourceType === "mls_replica",
    lastUpdatedAt: src.lastUpdatedAt,
  };
}

/** Raw shape of a city_market_snapshots row (subset the model needs). */
export interface SnapshotRow {
  as_of: string;
  active_listings: number | null;
  median_list_price: number | string | null;
  price_per_sqft: number | string | null;
  median_days_on_market: number | null;
  created_at?: string | null;
}

const num = (x: number | string | null | undefined): number | null => {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

/** Build the canonical set from an authoritative snapshot row. Metrics whose
    underlying value is absent are OMITTED, never zero-filled (only the
    listing count may legitimately be 0). YoY is built ONLY when a comparable
    row from ~one year earlier (350–380 days) is supplied. */
export function metricsFromSnapshotRow(
  city: CityRef,
  row: SnapshotRow,
  prevYearRow?: SnapshotRow | null
): CityMarketMetricSet {
  const src = {
    sourceType: "mls_replica" as const,
    sourceName: SOURCE_NTREIS,
    asOf: row.as_of,
    lastUpdatedAt: row.created_at ?? row.as_of,
  };
  const metrics: CityMarketMetricSet["metrics"] = {};

  const price = num(row.median_list_price);
  if (price !== null && price > 0) metrics.median_active_list_price = metric(city, "median_active_list_price", price, src);

  const ppsf = num(row.price_per_sqft);
  if (ppsf !== null && ppsf > 0) metrics.median_price_per_sqft = metric(city, "median_price_per_sqft", ppsf, src);

  const dom = num(row.median_days_on_market);
  if (dom !== null && dom >= 0) metrics.median_days_on_market = metric(city, "median_days_on_market", dom, src);

  const count = num(row.active_listings);
  if (count !== null && count >= 0) metrics.active_listing_count = metric(city, "active_listing_count", count, src);

  if (prevYearRow && price !== null && price > 0) {
    const prevPrice = num(prevYearRow.median_list_price);
    const spanDays = Math.round((Date.parse(row.as_of) - Date.parse(prevYearRow.as_of)) / 86_400_000);
    if (prevPrice !== null && prevPrice > 0 && spanDays >= 350 && spanDays <= 380) {
      const pct = ((price - prevPrice) / prevPrice) * 100;
      metrics.yoy_median_list_price_change = metric(
        city,
        "yoy_median_list_price_change",
        Math.round(pct * 10) / 10,
        src,
        { start: prevYearRow.as_of, end: row.as_of }
      );
    }
  }

  return { cityId: city.slug, citySlug: city.slug, cityName: city.name, ...src, metrics };
}

/** Editorial fallback set. No listing count (the dataset has none) and never
    YoY (a YoY without comparable history would be fabricated). */
export function metricsFromEditorial(city: CityRef & { price: number; ppsf: number; dom: number }): CityMarketMetricSet {
  const src = {
    sourceType: "editorial" as const,
    sourceName: SOURCE_EDITORIAL,
    asOf: EDITORIAL_DATASET_AS_OF,
    lastUpdatedAt: EDITORIAL_DATASET_AS_OF,
  };
  const metrics: CityMarketMetricSet["metrics"] = {};
  if (city.price > 0) metrics.median_active_list_price = metric(city, "median_active_list_price", city.price, src);
  if (city.ppsf > 0) metrics.median_price_per_sqft = metric(city, "median_price_per_sqft", city.ppsf, src);
  if (city.dom >= 0) metrics.median_days_on_market = metric(city, "median_days_on_market", city.dom, src);
  return { cityId: city.slug, citySlug: city.slug, cityName: city.name, ...src, metrics };
}

/* ---------------- formatting helpers (rule: one formatter per unit) ------ */

/** $415K under $1M, $1.45M from $1M up — every surface uses this one. */
export function fmtPrice(v: number): string {
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return "$" + (Math.round(m * 100) / 100).toFixed(m >= 10 ? 1 : 2).replace(/\.?0+$/, "") + "M";
  }
  return "$" + Math.round(v / 1000) + "K";
}

export function fmtMetricValue(m: CityMarketMetric): string {
  switch (m.unit) {
    case "usd":
      return fmtPrice(m.value);
    case "usd_per_sqft":
      return "$" + Math.round(m.value);
    case "days":
      return String(Math.round(m.value));
    case "listings":
      return m.value.toLocaleString("en-US");
    case "percent":
      return (m.value >= 0 ? "+" : "") + m.value.toFixed(1) + "%";
  }
}

export function fmtAsOf(iso: string): string {
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00Z" : iso);
  return d
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" })
    .toUpperCase();
}

/* ---------------- provenance labels (rule 6) ---------------- */

/** Compact one-line data label. Deliberately carries NO "pulled/updated on"
    date — an owner decision (2026-07): the retrieval date is not shown to
    users. Source attribution stays. (The IDX per-listing freshness stamp in
    components/compliance/LastUpdatedStamp is a separate, compliance-required
    element and is unaffected by this.) */
export function provenanceLabel(set: CityMarketMetricSet): string {
  if (set.sourceType === "mls_replica") {
    // residential definition (2026-08 hardening): snapshot figures cover
    // Residential + ResidentialIncome — the same inventory the home
    // search returns. Land is never blended into a "home price" median.
    return "ACTIVE RESIDENTIAL LISTINGS · MEDIANS OF LIST PRICES · SOURCE: NTREIS";
  }
  return "EDITORIAL FIGURES · SEEDED FROM NTREIS SNAPSHOT MEDIANS";
}

/** Short variant for tight surfaces (index headers, chips) — also dateless. */
export function provenanceLabelShort(set: Pick<CityMarketMetricSet, "sourceType">): string {
  return set.sourceType === "mls_replica" ? "ACTIVE-LISTING MEDIANS · NTREIS" : "EDITORIAL FIGURES";
}

/* ---------------- aggregates ---------------- */

export function medianOf(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/** "Median of city medians" — the only cross-city price aggregate we show.
    It is NOT a metro-wide listing median; every label that displays it must
    say what it measures (see docs/market-data-methodology.md). */
export function medianOfCityMedians(sets: CityMarketMetricSet[]): number | null {
  return medianOf(
    sets
      .map((s) => s.metrics.median_active_list_price?.value)
      .filter((v): v is number => typeof v === "number" && v > 0)
  );
}
