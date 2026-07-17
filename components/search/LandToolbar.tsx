"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cities } from "@/lib/dfw-data";
import { dfwCountyNames } from "@/data/dfw-cities";
import type { ListingStatus, SearchFilters, SortKey } from "@/lib/mls/types";
import { searchFiltersToQueryString, SLUG_BY_STATUS, STATUS_BY_SLUG } from "@/lib/mls/url";
import { LAND_CATEGORIES } from "@/lib/land/land";
import SaveSearchButton from "./SaveSearchButton";

/* The /land toolbar. Same field-guide chrome as the homes SearchToolbar, but
   the controls are land-specific: land CATEGORY chips (segmented, always
   visible — the primary land dimension), PRICE, ACREAGE (min/max steppers +
   quick bands), COUNTY (the 8 DFW-metro counties), STATUS, SORT, CLEAR.
   No beds/baths. Every control rewrites the /land query string, so results
   stay server-rendered, shareable, and back/forward-restorable. The search
   field is land-scoped: a city or county pick, or a keyword, all stay on
   /land — it never silently drops the reader into residential-home search. */

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

const PRICE_BANDS: { label: string; min?: number; max?: number }[] = [
  { label: "ANY PRICE" },
  { label: "UNDER $100K", max: 100000 },
  { label: "$100K – $250K", min: 100000, max: 250000 },
  { label: "$250K – $500K", min: 250000, max: 500000 },
  { label: "$500K – $1M", min: 500000, max: 1000000 },
  { label: "$1M+", min: 1000000 },
];

/* acreage quick-bands — land shoppers think in these buckets */
const ACRE_BANDS: { label: string; min?: number; max?: number }[] = [
  { label: "ANY SIZE" },
  { label: "UNDER 1 AC", max: 1 },
  { label: "1 – 5 AC", min: 1, max: 5 },
  { label: "5 – 20 AC", min: 5, max: 20 },
  { label: "20 – 50 AC", min: 20, max: 50 },
  { label: "50+ AC", min: 50 },
];

const STATUS_CHOICES: { label: string; slug: string }[] = [
  { label: "ANY", slug: "" },
  { label: "ACTIVE", slug: "active" },
  { label: "COMING SOON", slug: "coming-soon" },
  { label: "PENDING", slug: "pending" },
];

const fmtK = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0)}M` : `$${Math.round(v / 1000)}K`;

function priceLabel(min?: number, max?: number): string {
  if (min && max) return `${fmtK(min)}–${fmtK(max)}`;
  if (max) return `UNDER ${fmtK(max)}`;
  if (min) return `${fmtK(min)}+`;
  return "PRICE";
}
function acreLabel(min?: number, max?: number): string {
  const f = (n: number) => (Number.isInteger(n) ? String(n) : String(n));
  if (min && max) return `${f(min)}–${f(max)} AC`;
  if (max) return `< ${f(max)} AC`;
  if (min) return `${f(min)}+ AC`;
  return "ACREAGE";
}

const toInt = (s: string): number | undefined => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const toFloat = (s: string): number | undefined => {
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

function PopButton({ label, active, expanded, onClick }: { label: string; active: boolean; expanded: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-haspopup="true"
      onClick={onClick}
      className="font-mono"
      style={{ ...pill, letterSpacing: ".06em", fontSize: 11, borderColor: active ? "#D9481F" : "#1D1913", color: active ? "#C13E17" : "#1D1913" }}
    >
      {label} ▾
    </button>
  );
}

function OptionPill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
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

export default function LandToolbar({ query }: { query: SearchFilters }) {
  const router = useRouter();

  /* every change keeps land:true and stays on /land */
  const navigate = (patch: Partial<SearchFilters>) => {
    const q: SearchFilters = { ...query, ...patch, land: true };
    const qs = searchFiltersToQueryString(q);
    router.push(qs ? `/land?${qs}` : "/land");
  };

  const [open, setOpen] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [priceMinDraft, setPriceMinDraft] = useState("");
  const [priceMaxDraft, setPriceMaxDraft] = useState("");
  const [acreMinDraft, setAcreMinDraft] = useState("");
  const [acreMaxDraft, setAcreMaxDraft] = useState("");

  const openPop = (name: string) => {
    if (open === name) return setOpen(null);
    if (name === "price") {
      setPriceMinDraft(query.minPrice ? String(query.minPrice) : "");
      setPriceMaxDraft(query.maxPrice ? String(query.maxPrice) : "");
    } else if (name === "acreage") {
      setAcreMinDraft(query.minAcres ? String(query.minAcres) : "");
      setAcreMaxDraft(query.maxAcres ? String(query.maxAcres) : "");
    }
    setOpen(name);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("[data-ddfw-pop]")) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const applyPrice = () => {
    navigate({ minPrice: toInt(priceMinDraft), maxPrice: toInt(priceMaxDraft) });
    setOpen(null);
  };
  const applyAcres = () => {
    navigate({ minAcres: toFloat(acreMinDraft), maxAcres: toFloat(acreMaxDraft) });
    setOpen(null);
  };

  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const currentCityName = cities.find((c) => c.slug === query.citySlug)?.name || "";
  const hasActiveFilters = !!(
    query.minPrice || query.maxPrice || query.minAcres || query.maxAcres ||
    query.landCategory || query.county || query.citySlug || query.statuses?.length ||
    query.q || query.polygon
  );
  const clearAll = () =>
    navigate({
      minPrice: undefined, maxPrice: undefined, minAcres: undefined, maxAcres: undefined,
      landCategory: undefined, county: undefined, citySlug: undefined, statuses: undefined,
      q: undefined, polygon: undefined, sort: undefined,
    });

  /* save-search payload — replayable land standing order */
  const bits = [
    "DFW land",
    query.landCategory ? LAND_CATEGORIES.find((c) => c.key === query.landCategory)?.label.toLowerCase() : null,
    query.county ? `${query.county} county` : null,
    currentCityName || null,
    query.minAcres || query.maxAcres ? acreLabel(query.minAcres, query.maxAcres).toLowerCase() : null,
    query.minPrice || query.maxPrice ? priceLabel(query.minPrice, query.maxPrice).toLowerCase() : null,
  ].filter(Boolean);
  const savePayload = {
    name: bits.join(" · "),
    filters: { ...query, land: true },
    queryLabel: bits.join(" · "),
    queryString: searchFiltersToQueryString({ ...query, land: true }),
    frequency: "daily" as const,
    emailEnabled: true,
  };

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
        zIndex: open || searchOpen ? 1500 : undefined,
      }}
    >
      <LandSearchField query={query} onNavigate={navigate} onOpenChange={setSearchOpen} />

      {/* CATEGORY — segmented chips, always visible (the primary land axis) */}
      <div className="ddfw-toolbar-pills" role="group" aria-label="Land category" style={{ gap: 8 }}>
        <button
          type="button"
          onClick={() => navigate({ landCategory: undefined })}
          aria-pressed={!query.landCategory}
          className="font-mono"
          style={catChip(!query.landCategory)}
        >
          ALL LAND
        </button>
        {LAND_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => navigate({ landCategory: query.landCategory === c.key ? undefined : c.key })}
            aria-pressed={query.landCategory === c.key}
            className="font-mono"
            style={catChip(query.landCategory === c.key)}
          >
            {c.label.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="ddfw-toolbar-pills">
        {/* PRICE */}
        <div data-ddfw-pop style={{ position: "relative" }}>
          <PopButton label={priceLabel(query.minPrice, query.maxPrice)} active={!!(query.minPrice || query.maxPrice)} expanded={open === "price"} onClick={() => openPop("price")} />
          {open === "price" && (
            <div ref={panelRef} tabIndex={-1} style={panelStyle} role="dialog" aria-label="Price range">
              <div className="font-mono" style={monoLabel}>PRICE RANGE</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" inputMode="numeric" min={0} step={25000} placeholder="No min" aria-label="Minimum price" value={priceMinDraft} onChange={(e) => setPriceMinDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyPrice()} style={numInput} />
                <span style={{ fontWeight: 700, color: "rgba(29,25,19,.62)" }}>–</span>
                <input type="number" inputMode="numeric" min={0} step={25000} placeholder="No max" aria-label="Maximum price" value={priceMaxDraft} onChange={(e) => setPriceMaxDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyPrice()} style={numInput} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {PRICE_BANDS.map((b) => (
                  <OptionPill key={b.label} label={b.label} selected={(b.min ?? 0) === (toInt(priceMinDraft) ?? 0) && (b.max ?? 0) === (toInt(priceMaxDraft) ?? 0)} onClick={() => { setPriceMinDraft(b.min ? String(b.min) : ""); setPriceMaxDraft(b.max ? String(b.max) : ""); }} />
                ))}
              </div>
              <button type="button" onClick={applyPrice} className="font-mono" style={applyBtn}>APPLY</button>
            </div>
          )}
        </div>

        {/* ACREAGE — steppers + quick bands */}
        <div data-ddfw-pop style={{ position: "relative" }}>
          <PopButton label={acreLabel(query.minAcres, query.maxAcres)} active={!!(query.minAcres || query.maxAcres)} expanded={open === "acreage"} onClick={() => openPop("acreage")} />
          {open === "acreage" && (
            <div ref={panelRef} tabIndex={-1} style={panelStyle} role="dialog" aria-label="Acreage range">
              <div className="font-mono" style={monoLabel}>ACREAGE (ACRES)</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" inputMode="decimal" min={0} step={0.25} placeholder="No min" aria-label="Minimum acres" value={acreMinDraft} onChange={(e) => setAcreMinDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyAcres()} style={numInput} />
                <span style={{ fontWeight: 700, color: "rgba(29,25,19,.62)" }}>–</span>
                <input type="number" inputMode="decimal" min={0} step={0.25} placeholder="No max" aria-label="Maximum acres" value={acreMaxDraft} onChange={(e) => setAcreMaxDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyAcres()} style={numInput} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {ACRE_BANDS.map((b) => (
                  <OptionPill key={b.label} label={b.label} selected={(b.min ?? 0) === (toFloat(acreMinDraft) ?? 0) && (b.max ?? 0) === (toFloat(acreMaxDraft) ?? 0)} onClick={() => { setAcreMinDraft(b.min ? String(b.min) : ""); setAcreMaxDraft(b.max ? String(b.max) : ""); }} />
                ))}
              </div>
              <button type="button" onClick={applyAcres} className="font-mono" style={applyBtn}>APPLY</button>
            </div>
          )}
        </div>

        {/* COUNTY — the 8 DFW-metro counties */}
        <select
          aria-label="County"
          value={query.county ?? ""}
          onChange={(e) => navigate({ county: e.target.value || undefined })}
          className="font-mono"
          style={{ ...pill, letterSpacing: ".06em", fontSize: 11, color: query.county ? "#C13E17" : "#1D1913", borderColor: query.county ? "#D9481F" : "#1D1913" }}
        >
          <option value="">ALL COUNTIES</option>
          {dfwCountyNames.map((c) => (
            <option key={c} value={c}>{c.toUpperCase()} COUNTY</option>
          ))}
        </select>

        {/* STATUS */}
        <select
          aria-label="Listing status"
          value={query.statuses?.[0] ? SLUG_BY_STATUS[query.statuses[0]] : ""}
          onChange={(e) => {
            const s: ListingStatus | undefined = STATUS_BY_SLUG[e.target.value];
            navigate({ statuses: s ? [s] : undefined });
          }}
          className="font-mono"
          style={{ ...pill, letterSpacing: ".06em", fontSize: 11, color: query.statuses?.length ? "#C13E17" : "#1D1913", borderColor: query.statuses?.length ? "#D9481F" : "#1D1913" }}
        >
          {STATUS_CHOICES.map((s) => (
            <option key={s.slug || "any"} value={s.slug}>{s.slug ? s.label : "ANY STATUS"}</option>
          ))}
        </select>

        {/* SORT */}
        <select
          aria-label="Sort results"
          value={query.sort ?? "newest"}
          onChange={(e) => { const v = e.target.value as SortKey; navigate({ sort: v === "newest" ? undefined : v }); }}
          className="font-mono"
          style={{ ...pill, letterSpacing: ".06em", fontSize: 11 }}
        >
          <option value="newest">NEWEST FIRST</option>
          <option value="price-asc">PRICE — LOW TO HIGH</option>
          <option value="price-desc">PRICE — HIGH TO LOW</option>
        </select>

        {hasActiveFilters && (
          <button type="button" onClick={clearAll} className="font-mono" style={{ ...pill, fontSize: 10, letterSpacing: ".12em", background: "transparent", borderColor: "rgba(29,25,19,.35)", color: "rgba(29,25,19,.65)" }}>
            ✕ CLEAR
          </button>
        )}

        <SaveSearchButton payload={savePayload} />
      </div>
    </div>
  );
}

const catChip = (on: boolean): React.CSSProperties => ({
  border: on ? "1.5px solid #1D1913" : "1.5px solid rgba(29,25,19,.35)",
  borderRadius: 999,
  padding: "11px 15px",
  fontSize: 10.5,
  letterSpacing: ".1em",
  fontWeight: 700,
  background: on ? "#1D1913" : "#FBF7EE",
  color: on ? "#F6F1E6" : "#1D1913",
  cursor: "pointer",
  whiteSpace: "nowrap",
});

/* ---- land-scoped search field ---- */
function LandSearchField({ query, onNavigate, onOpenChange }: { query: SearchFilters; onNavigate: (patch: Partial<SearchFilters>) => void; onOpenChange: (open: boolean) => void }) {
  const initial = cities.find((c) => c.slug === query.citySlug)?.name || query.q || "";
  const [text, setText] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  type Sug = { kind: "city" | "county" | "keyword"; label: string; sub: string; citySlug?: string; county?: string; q?: string };
  const items = useMemo<Sug[]>(() => {
    const t = text.trim().toLowerCase();
    if (!t) return [];
    const out: Sug[] = [];
    for (const c of cities) {
      if (c.name.toLowerCase().includes(t)) out.push({ kind: "city", label: c.name, sub: "City · land only", citySlug: c.slug });
      if (out.length >= 6) break;
    }
    for (const c of dfwCountyNames) {
      if (c.toLowerCase().includes(t)) out.push({ kind: "county", label: `${c} County`, sub: "County · land only", county: c });
    }
    // always offer the raw keyword (address, subdivision, MLS#) as a land search
    out.push({ kind: "keyword", label: `Search “${text.trim()}”`, sub: "Address, subdivision, or MLS# — land only", q: text.trim() });
    return out.slice(0, 10);
  }, [text]);

  const choose = (s: Sug) => {
    setOpen(false);
    setActive(-1);
    if (s.kind === "city") { setText(s.label); onNavigate({ citySlug: s.citySlug, county: undefined, q: undefined }); }
    else if (s.kind === "county") { setText(""); onNavigate({ county: s.county, citySlug: undefined, q: undefined }); }
    else { onNavigate({ q: s.q, citySlug: undefined }); }
  };

  const submit = () => {
    setOpen(false);
    const v = text.trim();
    const cityHit = cities.find((c) => c.name.toLowerCase() === v.toLowerCase());
    const countyHit = dfwCountyNames.find((c) => c.toLowerCase() === v.toLowerCase());
    if (!v) onNavigate({ q: undefined, citySlug: undefined, county: undefined });
    else if (cityHit) onNavigate({ citySlug: cityHit.slug, county: undefined, q: undefined });
    else if (countyHit) onNavigate({ county: countyHit, citySlug: undefined, q: undefined });
    else onNavigate({ q: v, citySlug: undefined });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (open && active >= 0 && items[active]) choose(items[active]); else submit(); }
    else if (e.key === "Escape") { setOpen(false); setActive(-1); }
  };

  const showMenu = open && items.length > 0;
  useEffect(() => {
    onOpenChange(showMenu);
  }, [showMenu, onOpenChange]);

  return (
    <div ref={rootRef} style={{ position: "relative", flex: "1 1 260px", minWidth: 220 }}>
      <form
        role="search"
        aria-label="Search DFW land"
        onSubmit={(e) => { e.preventDefault(); if (open && active >= 0 && items[active]) choose(items[active]); else submit(); }}
        style={{ display: "flex", alignItems: "center", gap: 10, border: "2px solid #1D1913", borderRadius: 999, padding: "9px 18px", background: "#FBF7EE" }}
      >
        <svg viewBox="0 0 20 20" style={{ width: 15, height: 15, flexShrink: 0 }} aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="6" fill="none" stroke="#1D1913" strokeWidth="2" />
          <line x1="13" y1="13" x2="18" y2="18" stroke="#1D1913" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 120); }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showMenu}
          aria-autocomplete="list"
          placeholder="City, county, address, or MLS# — land only"
          aria-label="Search DFW land by city, county, address, or MLS number"
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 15, fontWeight: 600, fontFamily: "inherit", color: "#1D1913" }}
        />
        {text && (
          <button type="button" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => { setText(""); setActive(-1); }} style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "rgba(29,25,19,.5)", fontSize: 18, lineHeight: 1, padding: "0 4px" }}>×</button>
        )}
      </form>
      {showMenu && (
        <ul
          role="listbox"
          aria-label="Land search suggestions"
          onMouseDown={() => blurTimer.current && clearTimeout(blurTimer.current)}
          style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, width: "100%", zIndex: 2000, margin: 0, padding: "6px 0", listStyle: "none", background: "#FBF7EE", border: "2px solid #1D1913", borderRadius: 16, boxShadow: "0 22px 48px rgba(20,16,10,.24)", maxHeight: 340, overflowY: "auto", textAlign: "left" }}
        >
          {items.map((it, idx) => (
            <li
              key={`${it.kind}-${it.label}-${idx}`}
              role="option"
              aria-selected={idx === active}
              onMouseEnter={() => setActive(idx)}
              onMouseDown={(e) => { e.preventDefault(); choose(it); }}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 16px", cursor: "pointer", background: idx === active ? "rgba(217,72,31,.09)" : "transparent", color: "#1D1913" }}
            >
              <span style={{ color: "#C13E17", fontSize: 14 }} aria-hidden="true">{it.kind === "keyword" ? "⌕" : "◈"}</span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="font-serif" style={{ display: "block", fontWeight: 700, fontSize: 15, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</span>
                <span className="font-mono" style={{ display: "block", fontSize: 9, letterSpacing: ".1em", color: "rgba(29,25,19,.55)", marginTop: 2 }}>{it.sub.toUpperCase()}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
