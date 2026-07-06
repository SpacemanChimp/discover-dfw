"use client";
import { useRouter } from "next/navigation";
import { cities } from "@/lib/dfw-data";
import type { ListingStatus, PropertyType, SearchFilters } from "@/lib/mls/types";
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

  const navigate = (patch: Partial<SearchFilters>) => {
    const q = { ...query, ...patch };
    const target = q.citySlug && q.citySlug !== citySlug ? q.citySlug : citySlug;
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
  const bits = [
    currentCityName || "All of DFW",
    query.minBeds ? `${query.minBeds}+ bd` : null,
    query.minBaths ? `${query.minBaths}+ ba` : null,
    priceIdx > 0 ? PRICE_BANDS[priceIdx].label.toLowerCase() : null,
    query.propertyType || null,
    query.statuses?.[0] ? SLUG_BY_STATUS[query.statuses[0]].replace(/-/g, " ") : null,
    query.newBuildsOnly ? "new construction" : null,
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
        aria-label="Minimum bathrooms"
        value={query.minBaths ?? 0}
        onChange={(e) => navigate({ minBaths: Number(e.target.value) || undefined })}
        className="font-mono"
        style={{ ...pill, letterSpacing: ".06em", fontSize: 11 }}
      >
        <option value={0}>ANY BATHS</option>
        {[2, 3, 4].map((n) => (
          <option key={n} value={n}>
            {n}+ BATHS
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

      <select
        aria-label="Listing status"
        value={query.statuses?.[0] ? SLUG_BY_STATUS[query.statuses[0]] : ""}
        onChange={(e) => {
          const status: ListingStatus | undefined = STATUS_BY_SLUG[e.target.value];
          navigate({ statuses: status ? [status] : undefined });
        }}
        className="font-mono"
        style={{ ...pill, letterSpacing: ".06em", fontSize: 11 }}
      >
        <option value="">ANY STATUS</option>
        <option value="active">ACTIVE</option>
        <option value="coming-soon">COMING SOON</option>
        <option value="pending">PENDING</option>
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

      <SaveSearchButton payload={savePayload} />
    </div>
  );
}
