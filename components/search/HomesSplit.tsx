"use client";
import { useState, type ReactNode } from "react";

/* Client shell for the map-room split. The rail/map/index arrive
   server-rendered as ReactNode slots, so the only client weight here is the
   mobile list <-> map toggle — desktop layout (globals.css .homes-*) is
   untouched and the toggle button never renders above 940px. */
export default function HomesSplit({
  rail,
  map,
  extra,
  railDesktopOnly,
}: {
  rail: ReactNode;
  map: ReactNode;
  /** Mobile city index — rendered after the split, list view only. */
  extra?: ReactNode;
  /** No city chosen: mobile list view shows the index, not the rail. */
  railDesktopOnly?: boolean;
}) {
  const [view, setView] = useState<"list" | "map">("list");

  /* The map pane mounts display:none on phones, so Leaflet inits at 0x0.
     A ResizeObserver in LiveMapPanel usually catches the reveal, but the
     flip is announced explicitly too — observer timing must never be the
     only thing between the user and a working map. */
  function flip() {
    const next = view === "map" ? "list" : "map";
    setView(next);
    window.setTimeout(
      () => window.dispatchEvent(new CustomEvent("ddfw:homes-view", { detail: next })),
      0
    );
  }

  return (
    <div className={`homes-split${view === "map" ? " homes-view-map" : ""}`}>
      <div className={`homes-rail${railDesktopOnly ? " desktop-only-flex" : ""}`}>{rail}</div>
      <div className="homes-map">{map}</div>
      {extra}
      <button
        type="button"
        className="homes-map-toggle mobile-only font-mono"
        onClick={flip}
        style={{
          position: "fixed",
          bottom: "calc(18px + env(safe-area-inset-bottom))",
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
        }}
      >
        {view === "map" ? (
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
