"use client";
import { useRouter } from "next/navigation";
import { cities } from "@/lib/dfw-data";
import type { PropertyType, SearchFilters } from "@/lib/mls/types";
import { useShelf } from "@/lib/shelf";

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
  padding: "10px 16px",
  fontSize: 12.5,
  fontWeight: 600,
  background: "#FBF7EE",
  color: "#1D1913",
  fontFamily: "inherit",
  cursor: "pointer",
};

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
  const shelf = useShelf();

  const navigate = (patch: Partial<SearchFilters>) => {
    const q = { ...query, ...patch };
    const target = q.citySlug && q.citySlug !== citySlug ? q.citySlug : citySlug;
    const params = new URLSearchParams();
    if (!target && q.citySlug) params.set("city", q.citySlug);
    if (q.minPrice) params.set("min", String(q.minPrice));
    if (q.maxPrice) params.set("max", String(q.maxPrice));
    if (q.minBeds) params.set("beds", String(q.minBeds));
    if (q.propertyType) params.set("type", q.propertyType);
    if (q.newBuildsOnly) params.set("new", "1");
    const qs = params.toString();
    const path = target ? `/city/${target}/homes` : "/homes";
    router.push(qs ? `${path}?${qs}` : path);
  };

  const onCityInput = (value: string) => {
    const hit = cities.find((c) => c.name.toLowerCase() === value.toLowerCase());
    if (hit) navigate({ citySlug: hit.slug });
    else if (value === "") navigate({ citySlug: undefined });
  };

  const priceIdx = PRICE_BANDS.findIndex(
    (b) => (b.min ?? 0) === (query.minPrice ?? 0) && (b.max ?? 0) === (query.maxPrice ?? 0)
  );
  const currentCityName = cities.find((c) => c.slug === (citySlug || query.citySlug))?.name || "";

  const saveThisSearch = () => {
    const params = new URLSearchParams();
    const effCity = citySlug || query.citySlug;
    if (effCity) params.set("city", effCity);
    if (query.minPrice) params.set("min", String(query.minPrice));
    if (query.maxPrice) params.set("max", String(query.maxPrice));
    if (query.minBeds) params.set("beds", String(query.minBeds));
    if (query.propertyType) params.set("type", query.propertyType);
    if (query.newBuildsOnly) params.set("new", "1");
    const bits = [
      currentCityName || "All of DFW",
      query.minBeds ? `${query.minBeds}+ bd` : null,
      priceIdx > 0 ? PRICE_BANDS[priceIdx].label.toLowerCase() : null,
      query.propertyType || null,
      query.newBuildsOnly ? "new construction" : null,
    ].filter(Boolean);
    shelf.saveSearch({
      name: bits.join(" · "),
      // structured filters make the standing order replayable against any provider
      filters: { ...query, citySlug: effCity },
      queryLabel: bits.join(" · "),
      queryString: params.toString(),
      frequency: "Daily digest",
    });
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 4vw",
        borderBottom: "1.5px solid rgba(29,25,19,.2)",
        background: "#F2EBDC",
        flexWrap: "wrap",
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
          defaultValue={currentCityName}
          key={currentCityName}
          onChange={(e) => onCityInput(e.target.value)}
          placeholder="City, ISD, neighborhood, address…"
          aria-label="Search by city"
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

      <select
        aria-label="Price range"
        value={priceIdx === -1 ? 0 : priceIdx}
        onChange={(e) => {
          const b = PRICE_BANDS[Number(e.target.value)];
          navigate({ minPrice: b.min, maxPrice: b.max });
        }}
        className="font-mono"
        style={{ ...pill, letterSpacing: ".06em", fontSize: 11 }}
      >
        {PRICE_BANDS.map((b, i) => (
          <option key={b.label} value={i}>
            {b.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Minimum bedrooms"
        value={query.minBeds ?? 0}
        onChange={(e) => navigate({ minBeds: Number(e.target.value) || undefined })}
        className="font-mono"
        style={{ ...pill, letterSpacing: ".06em", fontSize: 11 }}
      >
        <option value={0}>ANY BEDS</option>
        {[2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}+ BEDS
          </option>
        ))}
      </select>

      <select
        aria-label="Home type"
        value={query.propertyType ?? ""}
        onChange={(e) => navigate({ propertyType: (e.target.value as PropertyType) || undefined })}
        className="font-mono"
        style={{ ...pill, letterSpacing: ".06em", fontSize: 11 }}
      >
        <option value="">HOME TYPE</option>
        {propertyTypes.map((t) => (
          <option key={t} value={t}>
            {t.toUpperCase()}
          </option>
        ))}
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

      <button
        type="button"
        onClick={saveThisSearch}
        className="btn-primary font-mono"
        style={{
          background: "#D9481F",
          color: "#F6F1E6",
          borderRadius: 999,
          padding: "11px 20px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".08em",
          border: "2px solid #D9481F",
          cursor: "pointer",
          marginLeft: "auto",
        }}
      >
        ♡ SAVE THIS SEARCH
      </button>
    </div>
  );
}
