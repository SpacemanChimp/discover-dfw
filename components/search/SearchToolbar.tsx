"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cities } from "@/lib/dfw-data";
import { RADIUS_OPTIONS } from "@/lib/mls/geo";
import type { ListingStatus, PropertyType, SearchFilters, SortKey } from "@/lib/mls/types";
import { searchFiltersToQueryString, SLUG_BY_STATUS, STATUS_BY_SLUG } from "@/lib/mls/url";
import SaveSearchButton from "./SaveSearchButton";

const PRICE_BANDS: { label: string; min?: number; max?: number }[] = [
  { label: "ANY PRICE" },
  { label: "UNDER $400K", max: 400000 },
  { label: "$300K – $550K", min: 300000, max: 550000 },
  { label: "$400K – $700K", min: 400000, max: 700000 },
  { label: "$550K – $900K", min: 550000, max: 900000 },
  { label: "$700K+", min: 700000 },
];

const pill: React.CSSProperties = {
  border: "1.5px solid #1D1913",
  borderRadius: 999,
  padding: "12px 16px",
  fontSize: 12.5,
  fontWeight: 600,
  background: "#FBF7EE",
  color: "#1D1913",
  fontFamily: "inherit",
  cursor: "pointer",
};

/* ---- popover chrome ---- */

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  left: 0,
  background: "#FBF7EE",
  border: "2px solid #1D1913",
  borderRadius: 16,
  boxShadow: "0 14px 34px rgba(20,16,10,.18)",
  padding: 18,
  minWidth: 260,
  maxWidth: "min(92vw, 340px)",
  zIndex: 60,
};

const monoLabel: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: ".16em",
  textTransform: "uppercase",
  color: "rgba(29,25,19,.65)",
  marginBottom: 8,
};

const numInput: React.CSSProperties = {
  /* flex-basis 0 (not width:100%) so the min/max input ROW's min-content
     collapses — number inputs have a ~190px intrinsic width that percentage
     widths don't override during shrink-to-fit, which made the mobile
     popover panel wider than the phone viewport (417px on a 390px screen) */
  flex: "1 1 0",
  width: "100%",
  minWidth: 0,
  border: "1.5px solid #1D1913",
  borderRadius: 10,
  padding: "9px 10px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "inherit",
  background: "#F6F1E6",
  color: "#1D1913",
  outline: "none",
};

const applyBtn: React.CSSProperties = {
  width: "100%",
  border: "1.5px solid #C13E17",
  borderRadius: 999,
  padding: "11px 16px",
  background: "#C13E17",
  color: "#F6F1E6",
  fontSize: 11,
  letterSpacing: ".14em",
  fontWeight: 700,
  cursor: "pointer",
  marginTop: 14,
};

function PopButton({
  label,
  active,
  expanded,
  onClick,
}: {
  label: string;
  active: boolean;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-haspopup="true"
      onClick={onClick}
      className="font-mono"
      style={{
        ...pill,
        letterSpacing: ".06em",
        fontSize: 11,
        borderColor: active ? "#D9481F" : "#1D1913",
        color: active ? "#C13E17" : "#1D1913",
      }}
    >
      {label} ▾
    </button>
  );
}

function OptionPill({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="font-mono"
      style={{
        border: selected ? "1.5px solid #1D1913" : "1.5px solid rgba(29,25,19,.35)",
        borderRadius: 999,
        padding: "10px 14px",
        fontSize: 10.5,
        letterSpacing: ".08em",
        background: selected ? "#1D1913" : "#FBF7EE",
        color: selected ? "#F6F1E6" : "#1D1913",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

/* ---- compact button-label summaries (Zillow-style) ---- */

const fmtK = (v: number) =>
  v >= 1_000_000
    ? `$${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0)}M`
    : `$${Math.round(v / 1000)}K`;

function priceLabel(min?: number, max?: number): string {
  if (min && max) return `${fmtK(min)}–${fmtK(max)}`;
  if (max) return `UNDER ${fmtK(max)}`;
  if (min) return `${fmtK(min)}+`;
  return "PRICE";
}

function bedsBathsLabel(minBeds?: number, minBaths?: number): string {
  const parts: string[] = [];
  if (minBeds) parts.push(`${minBeds}+ BD`);
  if (minBaths) parts.push(`${minBaths}+ BA`);
  return parts.length ? parts.join(", ") : "BEDS & BATHS";
}

/** Blank-safe positive-int parse — mirrors the server-side URL parser. */
const toNum = (s: string): number | undefined => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const STATUS_CHOICES: { label: string; slug: string }[] = [
  { label: "ANY", slug: "" },
  { label: "ACTIVE", slug: "active" },
  { label: "COMING SOON", slug: "coming-soon" },
  { label: "PENDING", slug: "pending" },
];

/* Filters live in the URL — every control rewrites the query string so
   results are server-rendered, shareable, and back-button friendly. */
export default function SearchToolbar({
  query,
  citySlug,
  propertyTypes,
}: {
  query: SearchFilters;
  /** When set, we're on /city/[slug]/homes and city is fixed by the path. */
  citySlug?: string;
  propertyTypes: string[];
}) {
  const router = useRouter();

  const navigate = (patch: Partial<SearchFilters>) => {
    const q = { ...query, ...patch };
    // In the Map Room (/homes) every change stays in the Map Room — the
    // map is the point. Only the dedicated /city/[slug]/homes pages keep
    // their path form (and switching city there moves to the new city).
    const target = citySlug
      ? q.citySlug && q.citySlug !== citySlug
        ? q.citySlug
        : citySlug
      : undefined;
    // one canonical serializer shared with the server-side parser
    const qs = searchFiltersToQueryString(q, !!target);
    const path = target ? `/city/${target}/homes` : "/homes";
    router.push(qs ? `${path}?${qs}` : path);
  };

  const onCityInput = (value: string) => {
    const hit = cities.find((c) => c.name.toLowerCase() === value.toLowerCase());
    if (hit) navigate({ citySlug: hit.slug, q: undefined });
    else if (value === "") navigate({ citySlug: undefined, q: undefined });
  };

  /** Enter on text that isn't a city name = keyword search (remarks,
      address, subdivision — "pool", "granite", a street name…). */
  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const value = (e.target as HTMLInputElement).value.trim();
    const isCity = cities.some((c) => c.name.toLowerCase() === value.toLowerCase());
    if (value && !isCity) navigate({ q: value });
  };

  const priceIdx = PRICE_BANDS.findIndex(
    (b) => (b.min ?? 0) === (query.minPrice ?? 0) && (b.max ?? 0) === (query.maxPrice ?? 0)
  );
  const currentCityName = cities.find((c) => c.slug === (citySlug || query.citySlug))?.name || "";

  const effCity = citySlug || query.citySlug;

  const hasActiveFilters = !!(
    query.minPrice || query.maxPrice || query.minBeds || query.minBaths ||
    query.minSqft || query.maxSqft || query.propertyType || query.statuses?.length ||
    query.newBuildsOnly || query.q || query.radiusMiles || query.polygon
  );
  const clearAll = () =>
    navigate({
      minPrice: undefined, maxPrice: undefined, minBeds: undefined, minBaths: undefined,
      minSqft: undefined, maxSqft: undefined, propertyType: undefined, statuses: undefined,
      newBuildsOnly: undefined, q: undefined, radiusMiles: undefined, sort: undefined,
      polygon: undefined,
    });

  const bits = [
    currentCityName || "All of DFW",
    query.minBeds ? `${query.minBeds}+ bd` : null,
    query.minBaths ? `${query.minBaths}+ ba` : null,
    priceIdx > 0 ? PRICE_BANDS[priceIdx].label.toLowerCase() : null,
    query.propertyType || null,
    query.statuses?.[0] ? SLUG_BY_STATUS[query.statuses[0]].replace(/-/g, " ") : null,
    query.newBuildsOnly ? "new construction" : null,
    query.polygon ? "custom boundary" : null,
  ].filter(Boolean);
  const savePayload = {
    name: bits.join(" · "),
    // structured filters make the standing order replayable against any provider
    filters: { ...query, citySlug: effCity },
    citySlug: effCity,
    queryLabel: bits.join(" · "),
    queryString: searchFiltersToQueryString({ ...query, citySlug: effCity }),
    frequency: "daily" as const,
    emailEnabled: true,
  };

  /* ---- popover state: one open at a time; drafts seed from the URL on
     open and only hit navigate() ONCE on APPLY (batched round trip) ---- */
  const [open, setOpen] = useState<string | null>(null);
  const [priceMinDraft, setPriceMinDraft] = useState("");
  const [priceMaxDraft, setPriceMaxDraft] = useState("");
  const [bedsDraft, setBedsDraft] = useState(0);
  const [bathsDraft, setBathsDraft] = useState(0);
  const [typeDraft, setTypeDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState("");
  const [minSqftDraft, setMinSqftDraft] = useState("");
  const [maxSqftDraft, setMaxSqftDraft] = useState("");
  const [radiusDraft, setRadiusDraft] = useState(0);

  const openPop = (name: string) => {
    if (open === name) {
      setOpen(null);
      return;
    }
    // re-seed drafts from the live query so stale edits never linger
    if (name === "price") {
      setPriceMinDraft(query.minPrice ? String(query.minPrice) : "");
      setPriceMaxDraft(query.maxPrice ? String(query.maxPrice) : "");
    } else if (name === "beds") {
      setBedsDraft(query.minBeds ?? 0);
      setBathsDraft(query.minBaths ?? 0);
    } else if (name === "filters") {
      setTypeDraft(query.propertyType ?? "");
      setStatusDraft(query.statuses?.[0] ? SLUG_BY_STATUS[query.statuses[0]] : "");
      setMinSqftDraft(query.minSqft ? String(query.minSqft) : "");
      setMaxSqftDraft(query.maxSqft ? String(query.maxSqft) : "");
      setRadiusDraft(query.radiusMiles ?? 0);
    }
    setOpen(name);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("[data-ddfw-pop]")) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const applyPrice = () => {
    navigate({ minPrice: toNum(priceMinDraft), maxPrice: toNum(priceMaxDraft) });
    setOpen(null);
  };
  const applyBedsBaths = () => {
    navigate({ minBeds: bedsDraft || undefined, minBaths: bathsDraft || undefined });
    setOpen(null);
  };
  const applyFilters = () => {
    const status: ListingStatus | undefined = STATUS_BY_SLUG[statusDraft];
    navigate({
      propertyType: (typeDraft as PropertyType) || undefined,
      statuses: status ? [status] : undefined,
      minSqft: toNum(minSqftDraft),
      maxSqft: toNum(maxSqftDraft),
      radiusMiles: radiusDraft || undefined,
    });
    setOpen(null);
  };

  /* role=dialog panels must actually receive focus when they open — only
     one is ever open, so a single ref travels between them */
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const filtersCount =
    (query.propertyType ? 1 : 0) +
    (query.statuses?.length ? 1 : 0) +
    (query.minSqft ? 1 : 0) +
    (query.maxSqft ? 1 : 0) +
    (query.radiusMiles ? 1 : 0);

  return (
    <div
      className="ddfw-toolbar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 4vw",
        borderBottom: "1.5px solid rgba(29,25,19,.2)",
        background: "#F2EBDC",
        flexWrap: "wrap",
        /* the sticky toolbar's stacking context is z 55 (globals.css) — under
           Leaflet's panes (400+). Fine until mobile MAP view, where an open
           popover hangs over the map and paints INVISIBLY beneath it. While a
           popover is open, lift the whole context above every map overlay
           (dots/controls/chip/toggle top out at 1400). */
        zIndex: open ? 1500 : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flex: "1 1 260px",
          minWidth: 220,
          border: "2px solid #1D1913",
          borderRadius: 999,
          padding: "9px 18px",
          background: "#FBF7EE",
        }}
      >
        <svg viewBox="0 0 20 20" style={{ width: 15, height: 15, flexShrink: 0 }} aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="6" fill="none" stroke="#1D1913" strokeWidth="2" />
          <line x1="13" y1="13" x2="18" y2="18" stroke="#1D1913" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          list="ddfw-cities"
          defaultValue={query.q || currentCityName}
          key={query.q || currentCityName}
          onChange={(e) => onCityInput(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="City, neighborhood, address, or keywords…"
          aria-label="Search by city or keywords"
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "inherit",
            color: "#1D1913",
          }}
        />
        <datalist id="ddfw-cities">
          {cities.map((c) => (
            <option key={c.slug} value={c.name} />
          ))}
        </datalist>
      </div>

      {/* pills row — desktop: display:contents keeps the single-row layout;
          mobile: becomes a horizontal-scroll strip under the full-width
          search box (globals.css .ddfw-toolbar-pills) */}
      <div className="ddfw-toolbar-pills">
      {/* PRICE popover */}
      <div data-ddfw-pop style={{ position: "relative" }}>
        <PopButton
          label={priceLabel(query.minPrice, query.maxPrice)}
          active={!!(query.minPrice || query.maxPrice)}
          expanded={open === "price"}
          onClick={() => openPop("price")}
        />
        {open === "price" && (
          <div ref={panelRef} tabIndex={-1} style={panelStyle} role="dialog" aria-label="Price range">
            <div className="font-mono" style={monoLabel}>PRICE RANGE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={25000}
                placeholder="No min"
                aria-label="Minimum price"
                value={priceMinDraft}
                onChange={(e) => setPriceMinDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyPrice()}
                style={numInput}
              />
              <span style={{ fontWeight: 700, color: "rgba(29,25,19,.62)" }}>–</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={25000}
                placeholder="No max"
                aria-label="Maximum price"
                value={priceMaxDraft}
                onChange={(e) => setPriceMaxDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyPrice()}
                style={numInput}
              />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {PRICE_BANDS.map((b) => (
                <OptionPill
                  key={b.label}
                  label={b.label}
                  selected={
                    (b.min ?? 0) === (toNum(priceMinDraft) ?? 0) &&
                    (b.max ?? 0) === (toNum(priceMaxDraft) ?? 0)
                  }
                  onClick={() => {
                    setPriceMinDraft(b.min ? String(b.min) : "");
                    setPriceMaxDraft(b.max ? String(b.max) : "");
                  }}
                />
              ))}
            </div>
            <button type="button" onClick={applyPrice} className="font-mono" style={applyBtn}>
              APPLY
            </button>
          </div>
        )}
      </div>

      {/* BEDS & BATHS popover */}
      <div data-ddfw-pop style={{ position: "relative" }}>
        <PopButton
          label={bedsBathsLabel(query.minBeds, query.minBaths)}
          active={!!(query.minBeds || query.minBaths)}
          expanded={open === "beds"}
          onClick={() => openPop("beds")}
        />
        {open === "beds" && (
          <div ref={panelRef} tabIndex={-1} style={panelStyle} role="dialog" aria-label="Beds and baths">
            <div className="font-mono" style={monoLabel}>BEDROOMS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <OptionPill
                  key={n}
                  label={n === 0 ? "ANY" : `${n}+`}
                  selected={bedsDraft === n}
                  onClick={() => setBedsDraft(n)}
                />
              ))}
            </div>
            <div className="font-mono" style={{ ...monoLabel, marginTop: 14 }}>BATHROOMS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[0, 1, 2, 3, 4].map((n) => (
                <OptionPill
                  key={n}
                  label={n === 0 ? "ANY" : `${n}+`}
                  selected={bathsDraft === n}
                  onClick={() => setBathsDraft(n)}
                />
              ))}
            </div>
            <button type="button" onClick={applyBedsBaths} className="font-mono" style={applyBtn}>
              APPLY
            </button>
          </div>
        )}
      </div>

      {/* FILTERS popover — home type, status, square feet, radius */}
      <div data-ddfw-pop style={{ position: "relative" }}>
        <PopButton
          label={filtersCount ? `FILTERS · ${filtersCount}` : "FILTERS"}
          active={filtersCount > 0}
          expanded={open === "filters"}
          onClick={() => openPop("filters")}
        />
        {open === "filters" && (
          <div
            ref={panelRef}
            tabIndex={-1}
            style={{ ...panelStyle, width: 320, maxHeight: "60vh", overflowY: "auto" }}
            role="dialog"
            aria-label="More filters"
          >
            <div className="font-mono" style={monoLabel}>HOME TYPE</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <OptionPill label="ANY" selected={typeDraft === ""} onClick={() => setTypeDraft("")} />
              {propertyTypes.map((t) => (
                <OptionPill
                  key={t}
                  label={t.toUpperCase()}
                  selected={typeDraft === t}
                  onClick={() => setTypeDraft(t)}
                />
              ))}
            </div>

            <div className="font-mono" style={{ ...monoLabel, marginTop: 14 }}>STATUS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {STATUS_CHOICES.map((s) => (
                <OptionPill
                  key={s.slug || "any"}
                  label={s.label}
                  selected={statusDraft === s.slug}
                  onClick={() => setStatusDraft(s.slug)}
                />
              ))}
            </div>

            <div className="font-mono" style={{ ...monoLabel, marginTop: 14 }}>SQUARE FEET</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                placeholder="No min"
                aria-label="Minimum square feet"
                value={minSqftDraft}
                onChange={(e) => setMinSqftDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                style={numInput}
              />
              <span style={{ fontWeight: 700, color: "rgba(29,25,19,.62)" }}>–</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                placeholder="No max"
                aria-label="Maximum square feet"
                value={maxSqftDraft}
                onChange={(e) => setMaxSqftDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                style={numInput}
              />
            </div>

            {effCity && (
              <>
                <div className="font-mono" style={{ ...monoLabel, marginTop: 14 }}>RADIUS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <OptionPill
                    label="IN TOWN ONLY"
                    selected={radiusDraft === 0}
                    onClick={() => setRadiusDraft(0)}
                  />
                  {RADIUS_OPTIONS.map((r) => (
                    <OptionPill
                      key={r}
                      label={`WITHIN ${r} MI`}
                      selected={radiusDraft === r}
                      onClick={() => setRadiusDraft(r)}
                    />
                  ))}
                </div>
              </>
            )}

            <button type="button" onClick={applyFilters} className="font-mono" style={applyBtn}>
              APPLY
            </button>
          </div>
        )}
      </div>

      <select
        aria-label="Sort results"
        value={query.sort ?? "newest"}
        onChange={(e) => {
          const v = e.target.value as SortKey;
          navigate({ sort: v === "newest" ? undefined : v });
        }}
        className="font-mono"
        style={{ ...pill, letterSpacing: ".06em", fontSize: 11 }}
      >
        <option value="newest">NEWEST FIRST</option>
        <option value="price-asc">PRICE — LOW TO HIGH</option>
        <option value="price-desc">PRICE — HIGH TO LOW</option>
        <option value="sqft-desc">LARGEST FIRST</option>
      </select>

      <button
        type="button"
        onClick={() => navigate({ newBuildsOnly: query.newBuildsOnly ? undefined : true })}
        aria-pressed={!!query.newBuildsOnly}
        className="font-mono"
        style={{
          ...pill,
          fontSize: 11,
          letterSpacing: ".1em",
          background: query.newBuildsOnly ? "#1D1913" : "#FBF7EE",
          color: query.newBuildsOnly ? "#F6F1E6" : "rgba(29,25,19,.65)",
          borderColor: query.newBuildsOnly ? "#1D1913" : "rgba(29,25,19,.4)",
        }}
      >
        NEW BUILDS
      </button>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="font-mono"
          style={{
            ...pill,
            fontSize: 10,
            letterSpacing: ".12em",
            background: "transparent",
            borderColor: "rgba(29,25,19,.35)",
            color: "rgba(29,25,19,.65)",
          }}
        >
          ✕ CLEAR
        </button>
      )}

      <SaveSearchButton payload={savePayload} />
      </div>
    </div>
  );
}
