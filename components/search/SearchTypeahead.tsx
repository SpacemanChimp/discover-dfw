"use client";
/* The field-guide search typeahead — replaces the native <datalist> (the
   unstyled browser bar) with a categorized, keyboard-accessible combobox.
   Cities, neighborhoods, and new-build communities come instant + client-side
   (navigational, editorial). SCHOOLS, DISTRICTS, and listing ADDRESSES come
   from the MLS store via the debounced /api/search-suggest route — the school
   and district options are the distinct values actually reported across
   on-market listings, so they can't drift from the data. Signed-in visitors
   also see their saved homes, saved searches, and recent searches; guests
   don't.

   Selecting a school routes to a metro-wide homes search filtered to every
   listing whose MLS record reports that school (schools cross city lines;
   not a zoning claim).

   ARIA combobox pattern: role=combobox + aria-expanded/-controls/
   -activedescendant on the input, role=listbox/option on the menu, full
   arrow/Enter/Esc keyboard support. */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { cities } from "@/lib/dfw-data";
import { searchFiltersToQueryString } from "@/lib/mls/url";
import { searchFiltersLabel } from "@/lib/mls/url";
import { useShelf } from "@/lib/shelf";
import { staticSuggestions, type Suggestion } from "@/lib/search/suggest";

const RECENT_KEY = "ddfw.search.recent.v1";
const INK = "#1D1913";
const ORANGE = "#C13E17";

type Item = Suggestion & { section: string; icon: IconName };
type IconName = "pin" | "school" | "district" | "home" | "heart" | "clock" | "saved-search";

/* ---- inline icons (match the site's thin-stroke SVG language) ---- */
function Icon({ name }: { name: IconName }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const box = { width: 16, height: 16, flexShrink: 0, display: "block" };
  switch (name) {
    case "pin":
      return (<svg viewBox="0 0 20 20" style={box} aria-hidden="true"><path {...p} d="M10 18s6-5.3 6-10a6 6 0 10-12 0c0 4.7 6 10 6 10z" /><circle {...p} cx="10" cy="8" r="2" /></svg>);
    case "school":
      return (<svg viewBox="0 0 20 20" style={box} aria-hidden="true"><path {...p} d="M10 3 2 7l8 4 8-4-8-4z" /><path {...p} d="M5 9v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V9" /></svg>);
    case "district":
      // civic building (columns) — reads as "district", distinct from a single school
      return (<svg viewBox="0 0 20 20" style={box} aria-hidden="true"><path {...p} d="M3 8l7-4 7 4" /><path {...p} d="M4 8v7m4-7v7m4-7v7m4-7v7" /><path {...p} d="M3 16h14" /></svg>);
    case "home":
      return (<svg viewBox="0 0 20 20" style={box} aria-hidden="true"><path {...p} d="M3 9l7-5 7 5" /><path {...p} d="M5 8.5V16h10V8.5" /></svg>);
    case "heart":
      return (<svg viewBox="0 0 20 20" style={box} aria-hidden="true"><path {...p} d="M10 16S3.5 12 3.5 7.5A3.5 3.5 0 0110 5a3.5 3.5 0 016.5 2.5C16.5 12 10 16 10 16z" /></svg>);
    case "clock":
      return (<svg viewBox="0 0 20 20" style={box} aria-hidden="true"><circle {...p} cx="10" cy="10" r="7" /><path {...p} d="M10 6v4l3 2" /></svg>);
    case "saved-search":
      return (<svg viewBox="0 0 20 20" style={box} aria-hidden="true"><circle {...p} cx="9" cy="9" r="5.5" /><path {...p} d="M13 13l4 4" /></svg>);
  }
}

const ICON_FOR: Record<Suggestion["kind"], IconName> = { city: "pin", neighborhood: "pin", "new-build": "home", school: "school", district: "district", address: "home" } as Record<Suggestion["kind"], IconName>;

interface Recent {
  label: string;
  sublabel: string;
  href: string;
}
function readRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, 5);
  } catch {
    return [];
  }
}
function pushRecent(r: Recent) {
  try {
    const list = [r, ...readRecent().filter((x) => x.href !== r.href)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage blocked */
  }
}

export default function SearchTypeahead({
  placeholder = "Search a city, neighborhood, school, address, or ZIP",
  autoFocus = false,
  size = "hero",
  initialValue = "",
  onPick,
  onRawSubmit,
  onOpenChange,
}: {
  placeholder?: string;
  autoFocus?: boolean;
  size?: "hero" | "toolbar";
  /** seed the field (toolbar shows the active city/keyword) */
  initialValue?: string;
  /** when set, a city/school pick calls this (to MERGE into active filters)
      instead of navigating; page picks still navigate. Toolbar mode. */
  onPick?: (it: { kind: Suggestion["kind"]; citySlug?: string; schoolName?: string; schoolLevel?: Suggestion["schoolLevel"]; districtName?: string; href: string }) => void;
  /** when set, a raw keyword submit calls this instead of the default route */
  onRawSubmit?: (q: string) => void;
  /** fires when the dropdown opens/closes — the toolbar uses it to lift its
      stacking context above the Leaflet map while suggestions are showing */
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const shelf = useShelf();
  const listId = useId();
  const [query, setQuery] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [live, setLive] = useState<Suggestion[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setRecent(readRecent()), []);

  const signedIn = !!shelf.account;
  const savedCount = Object.keys(shelf.saved || {}).length;

  /* debounced live address lookup */
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setLive([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setLive((data.suggestions || []).map((s) => ({ ...s })));
      } catch {
        /* aborted or offline — static suggestions still show */
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  /* build the flat, ordered item list (drives both render and keyboard nav) */
  const items = useMemo<Item[]>(() => {
    const q = query.trim();
    const out: Item[] = [];
    if (q.length < 2) {
      // empty/short: signed-in members get their own data; guests get nothing
      if (signedIn) {
        if (savedCount > 0)
          out.push({ kind: "address", label: `Your saved homes (${savedCount})`, sublabel: "On your shelf", href: "/account/saved-homes", hay: "", section: "Your shelf", icon: "heart" });
        for (const s of shelf.searches || [])
          out.push({ kind: "address", label: searchFiltersLabel(s, s.citySlug ? cities.find((c) => c.slug === s.citySlug)?.name : undefined), sublabel: "Saved search", href: `/homes?${searchFiltersToQueryString(s)}`, hay: "", section: "Saved searches", icon: "saved-search" });
        for (const r of recent)
          out.push({ kind: "address", label: r.label, sublabel: r.sublabel, href: r.href, hay: "", section: "Recent", icon: "clock" });
      }
      return out;
    }
    for (const s of staticSuggestions(q, 8)) out.push({ ...s, section: sectionFor(s.kind), icon: ICON_FOR[s.kind] });
    // live = MLS-sourced schools + districts + addresses (from /api/search-suggest)
    for (const s of live.slice(0, 14)) out.push({ ...s, section: sectionFor(s.kind), icon: ICON_FOR[s.kind] });
    return out;
  }, [query, live, recent, signedIn, savedCount, shelf.searches]);

  function sectionFor(kind: Suggestion["kind"]): string {
    switch (kind) {
      case "city": return "Cities";
      case "school": return "Schools";
      case "district": return "School districts";
      case "new-build": return "New-build communities";
      case "address": return "Addresses";
      default: return "Neighborhoods";
    }
  }

  useEffect(() => {
    if (active >= items.length) setActive(items.length ? items.length - 1 : -1);
  }, [items, active]);

  function choose(it: Item) {
    pushRecent({ label: it.label, sublabel: it.sublabel, href: it.href });
    setOpen(false);
    setActive(-1);
    // toolbar mode: city/school/district picks merge into the active filters
    // via the callback; everything else (neighborhood, new-build, address,
    // saved) navigates to its own page regardless.
    if (onPick && (it.kind === "city" || it.kind === "school" || it.kind === "district")) {
      onPick({ kind: it.kind, citySlug: it.citySlug, schoolName: it.schoolName, schoolLevel: it.schoolLevel, districtName: it.districtName, href: it.href });
      return;
    }
    router.push(it.href);
  }

  function submitRaw() {
    const v = query.trim();
    setOpen(false);
    if (onRawSubmit) {
      onRawSubmit(v);
      return;
    }
    if (!v) {
      router.push("/homes");
      return;
    }
    const hit = cities.find((c) => c.name.toLowerCase() === v.toLowerCase());
    const qs = hit ? searchFiltersToQueryString({ citySlug: hit.slug }) : searchFiltersToQueryString({ q: v });
    pushRecent({ label: v, sublabel: hit ? "City · TX" : "Keyword search", href: qs ? `/homes?${qs}` : "/homes" });
    router.push(qs ? `/homes?${qs}` : "/homes");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0 && items[active]) choose(items[active]);
      else submitRaw();
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const pad = size === "hero" ? "8px 8px 8px 20px" : "0";
  const inputFont = size === "hero" ? 16 : 15;
  const showMenu = open && items.length > 0;

  useEffect(() => {
    onOpenChange?.(showMenu);
  }, [showMenu, onOpenChange]);

  // The dropdown is PORTALED to <body> so it escapes every parent stacking
  // context (the hero's CTA row, the city ticker, the Leaflet map…) and can
  // never be clipped or painted over. Track the anchor rect in viewport
  // coords for the fixed-position menu; recompute on scroll/resize.
  const [rect, setRect] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    if (!showMenu) return;
    const measure = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (r) {
        const top = r.bottom + 8;
        // never spill past the viewport bottom — cap the height to the space
        // below the input so the menu scrolls internally instead of running
        // off-screen on short viewports
        const maxHeight = Math.min(460, Math.max(180, window.innerHeight - top - 12));
        setRect({ top, left: r.left, width: r.width, maxHeight });
      }
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [showMenu]);

  // group consecutive items by section for headers
  const groups: { section: string; items: Item[] }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.section === it.section) last.items.push(it);
    else groups.push({ section: it.section, items: [it] });
  }
  let flatIdx = -1;

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%" }}>
      <form
        role="search"
        aria-label="Search DFW homes"
        onSubmit={(e) => {
          e.preventDefault();
          if (open && active >= 0 && items[active]) choose(items[active]);
          else submitRaw();
        }}
        style={
          size === "hero"
            ? { display: "flex", alignItems: "center", gap: 10, background: "#FBF7EE", border: `2px solid ${INK}`, borderRadius: 999, padding: pad, boxShadow: "0 14px 30px rgba(29,25,19,.12)" }
            : { display: "flex", alignItems: "center", gap: 8, width: "100%" }
        }
      >
        {size === "hero" && (
          <svg viewBox="0 0 20 20" style={{ width: 17, height: 17, flexShrink: 0 }} aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="6" fill="none" stroke={INK} strokeWidth="2" />
            <line x1="13" y1="13" x2="18" y2="18" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        <input
          ref={inputRef}
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showMenu}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showMenu && active >= 0 ? `${listId}-opt-${active}` : undefined}
          placeholder={placeholder}
          aria-label={placeholder}
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: inputFont, fontWeight: 600, fontFamily: "inherit", color: INK }}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery("");
              setLive([]);
              setActive(-1);
              inputRef.current?.focus();
            }}
            style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "rgba(29,25,19,.5)", fontSize: 18, lineHeight: 1, padding: "0 4px" }}
          >
            ×
          </button>
        )}
        {size === "hero" && (
          <button type="submit" className="btn-primary" style={{ background: "#D9481F", color: "#F6F1E6", border: "2px solid #D9481F", borderRadius: 999, padding: "12px 26px", fontWeight: 700, fontSize: 14.5, letterSpacing: ".03em", fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" }}>
            Search
          </button>
        )}
      </form>

      {showMenu &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
        <ul
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          onMouseDown={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
          style={{
            position: "fixed",
            top: rect.top,
            left: rect.left,
            width: rect.width,
            // above the map (400+), the toolbar boost (1500), and anything else
            zIndex: 2000,
            margin: 0,
            padding: "6px 0",
            listStyle: "none",
            background: "#FBF7EE",
            border: `2px solid ${INK}`,
            borderRadius: 18,
            boxShadow: "0 22px 48px rgba(20,16,10,.24)",
            maxHeight: rect.maxHeight,
            overflowY: "auto",
            textAlign: "left",
          }}
        >
          {groups.map((g) => (
            <li key={g.section} role="presentation">
              <div className="font-mono" style={{ padding: "8px 16px 4px", fontSize: 8.5, fontWeight: 700, letterSpacing: ".2em", color: "rgba(29,25,19,.5)" }}>
                {g.section.toUpperCase()}
              </div>
              <ul role="presentation" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {g.items.map((it) => {
                  flatIdx += 1;
                  const idx = flatIdx;
                  const isActive = idx === active;
                  return (
                    <li
                      key={`${it.href}-${idx}`}
                      id={`${listId}-opt-${idx}`}
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActive(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        choose(it);
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 16px", cursor: "pointer", background: isActive ? "rgba(217,72,31,.09)" : "transparent", color: INK }}
                    >
                      <span style={{ color: ORANGE, display: "flex" }}>
                        <Icon name={it.icon} />
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span className="font-serif" style={{ display: "block", fontWeight: 700, fontSize: 15, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {it.label}
                        </span>
                        <span className="font-mono" style={{ display: "block", fontSize: 9, letterSpacing: ".1em", color: "rgba(29,25,19,.55)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {it.sublabel.toUpperCase()}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>,
          document.body
        )}
    </div>
  );
}
