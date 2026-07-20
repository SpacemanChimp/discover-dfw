"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { track } from "@/lib/analytics/track";

/* Client shell for the map-room split. The rail/map/index arrive
   server-rendered as ReactNode slots, so the only client weight here is the
   mobile list <-> map toggle plus the sticky-header measurement.

   --homes-head: the panes used to hardcode "138px" (nav 66 + toolbar 74) —
   the SCROLLED header height. At scroll 0 the un-stuck feed strip pushed the
   real offset to 169px, so the rail/map overhung the viewport by 31px and the
   whole document scrolled before the rail ever did — on every entry point
   (/homes, city search, filter links…). We now measure whichever header bars
   are ACTUALLY sticky at this breakpoint and publish the total, so the panes
   are exactly viewport-bounded beneath the real header at any width, with any
   toolbar wrap, on any entry path. */

/* the bars that can sit above the split, top-down */
const HEAD_SELECTORS = [".homes-search-nav", ".homes-head-strip", ".ddfw-toolbar"];

export default function HomesSplit({
  rail,
  map,
  extra,
  railDesktopOnly,
  initialView = "map",
}: {
  rail: ReactNode;
  map: ReactNode;
  /** Mobile city index — rendered after the split, list view only. */
  extra?: ReactNode;
  /** No city chosen: mobile list view shows the index, not the rail. */
  railDesktopOnly?: boolean;
  /** Phones open on the map unless the URL asked for a view (?view=list). */
  initialView?: "list" | "map";
}) {
  const [view, setView] = useState<"list" | "map">(initialView);
  const [splitInView, setSplitInView] = useState(true);
  const splitRef = useRef<HTMLDivElement>(null);

  /* The floating LIST/MAP toggle is position:fixed, so on surfaces with
     editorial content below the split (/land, /new-builds) it would hover over
     that content. Fade it out once the split leaves the viewport center — it's
     only meaningful while the map/list split is what you're looking at. */
  useEffect(() => {
    const el = splitRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setSplitInView(e.isIntersecting), {
      rootMargin: "-45% 0px -45% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* Measure the real sticky header. A stale React tree can leave duplicate
     0-height copies of these bars in the DOM, so take the first LAID-OUT
     match, and only count bars that are genuinely sticky right now (phones
     make the nav static, so it must not be added there). */
  useEffect(() => {
    const el = splitRef.current;
    if (!el) return;
    const pick = (sel: string) =>
      [...document.querySelectorAll<HTMLElement>(sel)].find((n) => n.getBoundingClientRect().height > 0) ?? null;

    const measure = () => {
      let h = 0;
      for (const sel of HEAD_SELECTORS) {
        const n = pick(sel);
        if (n && getComputedStyle(n).position === "sticky") h += n.getBoundingClientRect().height;
      }
      if (h > 0) el.style.setProperty("--homes-head", `${Math.round(h)}px`);
    };

    measure();
    const ro = new ResizeObserver(measure);
    for (const sel of HEAD_SELECTORS) {
      const n = pick(sel);
      if (n) ro.observe(n);
    }
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  /* The map pane mounts display:none on phones, so Leaflet inits at 0x0.
     A ResizeObserver in LiveMapPanel usually catches the reveal, but the
     flip is announced explicitly too — observer timing must never be the
     only thing between the user and a working map. Also fired on mount so a
     map-first phone load reveals correctly. */
  function announce(next: "list" | "map") {
    window.setTimeout(
      () => window.dispatchEvent(new CustomEvent("ddfw:homes-view", { detail: next })),
      0
    );
  }
  useEffect(() => {
    announce(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flip() {
    const next = view === "map" ? "list" : "map";
    setView(next);
    announce(next);
    track("search_view_changed", { view: next, scope: "homes" });
  }

  const mapMode = view === "map";
  return (
    <div ref={splitRef} className={`homes-split${mapMode ? " homes-view-map" : ""}`}>
      <div className={`homes-rail${railDesktopOnly ? " desktop-only-flex" : ""}`}>{rail}</div>
      <div className="homes-map">{map}</div>
      {extra}
      <button
        type="button"
        className="homes-map-toggle mobile-only font-mono"
        onClick={flip}
        /* toggle semantics: pressed === the map is the active view; the label
           says what pressing it does, so both state and action are spoken */
        aria-pressed={mapMode}
        aria-hidden={!splitInView}
        aria-label={mapMode ? "Showing map. Switch to list view." : "Showing list. Switch to map view."}
        style={{
          position: "fixed",
          bottom: "calc(20px + env(safe-area-inset-bottom))",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1400,
          background: "#1D1913",
          color: "#F6F1E6",
          border: "none",
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: ".18em",
          padding: "14px 26px",
          boxShadow: "0 14px 30px rgba(29,25,19,.35)",
          cursor: "pointer",
          // fade out (and stop intercepting taps) once scrolled past the split
          // into any editorial content below
          opacity: splitInView ? 1 : 0,
          pointerEvents: splitInView ? "auto" : "none",
          transition: "opacity .2s ease",
        }}
      >
        {mapMode ? (
          <>
            <span aria-hidden="true">☰</span> LIST
          </>
        ) : (
          <>
            <span aria-hidden="true">◐</span> MAP
          </>
        )}
      </button>
    </div>
  );
}
