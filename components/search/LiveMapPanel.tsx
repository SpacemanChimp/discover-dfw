"use client";
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, LayerGroup, Renderer } from "leaflet";
import type { MapPin } from "@/lib/mls/local";
import { bySlug } from "@/lib/dfw-data";

/* The Map Room's live pane: a real geographic map (Leaflet + Carto Voyager
   raster tiles) with branded price pins fed by /api/map-pins. Leaflet itself
   is dynamic-imported inside useEffect so it never touches the server bundle.

   Two marker modes keep big result sets honest: over 250 pins at wide zooms
   the map draws canvas dots (orange, ink ring); zoom in past 13 — or pan
   until fewer than 250 pins are in view — and the visible pins swap to the
   cream price bubbles. Clicking either opens a branded mini card linking to
   the listing. */

type Leaflet = typeof import("leaflet");

type PinPayload = { pins: MapPin[]; total: number; capped: boolean };

const BUBBLE_LIMIT = 250; // above this, wide zooms fall back to canvas dots
const BUBBLE_ZOOM = 13; // at/after this zoom, visible pins always get bubbles

function fmtPrice(p: number): string {
  if (p >= 1_000_000) return "$" + (p / 1_000_000).toFixed(1) + "M";
  return "$" + Math.round(p / 1000) + "K";
}

/** Feed strings go into Leaflet HTML strings — escape them. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function popupHtml(p: MapPin): string {
  return (
    `<div class="ddfw-pop">` +
    `<div class="ddfw-pop-price">$${Math.round(p.p).toLocaleString("en-US")}</div>` +
    `<div class="ddfw-pop-addr">${esc(p.a)}${p.c ? ", " + esc(p.c) : ""}</div>` +
    `<div class="ddfw-pop-meta">${p.b} BD &middot; ${p.ba} BA</div>` +
    `<a class="ddfw-pop-link" href="/listing/${encodeURIComponent(p.k)}">VIEW LISTING &rarr;</a>` +
    `</div>`
  );
}

const MAP_CSS = `
.ddfw-pin-wrap { background: transparent; border: none; }
.ddfw-pin {
  position: absolute; transform: translate(-50%, -50%);
  display: inline-block; white-space: nowrap;
  background: #FBF7EE; color: #1D1913;
  border: 1.5px solid #1D1913; border-radius: 999px;
  padding: 3px 9px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 10px; font-weight: 700; letter-spacing: .04em;
  box-shadow: 0 4px 10px rgba(20,16,10,.22);
  cursor: pointer;
}
.ddfw-pin:hover { background: #1D1913; color: #F6F1E6; }
.ddfw-popup .leaflet-popup-content-wrapper {
  background: #FBF7EE; color: #1D1913;
  border: 2px solid #1D1913; border-radius: 14px;
  box-shadow: 0 14px 28px rgba(20,16,10,.28);
}
.ddfw-popup .leaflet-popup-content { margin: 12px 14px; line-height: 1.35; }
.ddfw-popup .leaflet-popup-tip { background: #FBF7EE; border: 2px solid #1D1913; }
.ddfw-popup .leaflet-popup-close-button { color: #1D1913; font-weight: 700; }
.ddfw-pop { min-width: 170px; }
.ddfw-pop-price {
  font-family: var(--font-playfair), Georgia, serif;
  font-weight: 800; font-size: 19px; color: #D9481F;
}
.ddfw-pop-addr {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 10px; letter-spacing: .06em; margin-top: 4px;
  color: #1D1913; text-transform: uppercase;
}
.ddfw-pop-meta {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 9px; letter-spacing: .16em; margin-top: 4px;
  color: rgba(29,25,19,.6);
}
.ddfw-pop-link {
  display: inline-block; margin-top: 8px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 9px; letter-spacing: .16em; font-weight: 700;
  color: #D9481F; text-decoration: none;
  border-bottom: 1.5px solid #D9481F; padding-bottom: 1px;
}
.ddfw-pop-link:hover { color: #1D1913; border-bottom-color: #1D1913; }
`;

export default function LiveMapPanel({
  qs,
  activeCitySlug,
  total,
}: {
  /** Serialized current filters (searchFiltersToQueryString output, no page). */
  qs: string;
  activeCitySlug?: string;
  total: number;
}) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<Leaflet | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const canvasRef = useRef<Renderer | null>(null);
  const pinsRef = useRef<MapPin[]>([]);
  const [ready, setReady] = useState(false);
  const [payload, setPayload] = useState<PinPayload | null>(null);
  const [failed, setFailed] = useState(false);

  /* Rebuilds the marker layer from pinsRef against the current viewport.
     Reads only refs, so the instance captured by Leaflet's moveend handler
     stays correct across renders. */
  function renderMarkers() {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    layerRef.current?.remove();
    const layer = L.layerGroup();
    layerRef.current = layer;
    const pins = pinsRef.current;
    if (!pins.length) return;

    // bubbles === null means dot mode (big set, wide zoom)
    let bubbles: MapPin[] | null = null;
    if (pins.length <= BUBBLE_LIMIT) {
      bubbles = pins;
    } else {
      const view = map.getBounds();
      const visible = pins.filter((p) => view.contains([p.lat, p.lon]));
      if (map.getZoom() >= BUBBLE_ZOOM || visible.length <= BUBBLE_LIMIT) bubbles = visible;
    }

    if (bubbles) {
      for (const p of bubbles) {
        const icon = L.divIcon({
          className: "ddfw-pin-wrap",
          html: `<span class="ddfw-pin">${fmtPrice(p.p)}</span>`,
          iconSize: [0, 0],
        });
        layer.addLayer(
          L.marker([p.lat, p.lon], { icon }).bindPopup(popupHtml(p), {
            className: "ddfw-popup",
            maxWidth: 260,
          })
        );
      }
    } else {
      for (const p of pins) {
        layer.addLayer(
          L.circleMarker([p.lat, p.lon], {
            renderer: canvasRef.current ?? undefined,
            radius: 5,
            color: "#1D1913",
            weight: 1,
            fillColor: "#D9481F",
            fillOpacity: 1,
          }).bindPopup(popupHtml(p), { className: "ddfw-popup", maxWidth: 260 })
        );
      }
    }
    layer.addTo(map);
  }

  /* Map bootstrap — once. Leaflet loads client-side only. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      const L: Leaflet = ((mod as { default?: Leaflet }).default ?? mod) as Leaflet;
      if (cancelled || !mapDivRef.current || mapRef.current) return;
      leafletRef.current = L;
      const home = activeCitySlug ? bySlug[activeCitySlug]?.ll : undefined;
      const map = L.map(mapDivRef.current).setView(
        home ? [home[1], home[0]] : [32.9, -97.04], // ll is [lon, lat]
        home ? 11 : 9
      );
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      }).addTo(map);
      canvasRef.current = L.canvas({ padding: 0.3 });
      map.on("moveend zoomend", () => {
        // only the two-mode sets care about the viewport
        if (pinsRef.current.length > BUBBLE_LIMIT) renderMarkers();
      });
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Pins — refetch whenever the serialized filters change. */
  useEffect(() => {
    const ctrl = new AbortController();
    setFailed(false);
    // no-store: the browser must never replay stale pins (the CDN still
    // caches at the edge via the route's s-maxage)
    fetch(`/api/map-pins${qs ? `?${qs}` : ""}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`map-pins ${r.status}`);
        return r.json();
      })
      .then((j: PinPayload) => {
        const pins = Array.isArray(j?.pins) ? j.pins : [];
        setPayload({ pins, total: typeof j?.total === "number" ? j.total : pins.length, capped: !!j?.capped });
      })
      .catch((e: unknown) => {
        if ((e as Error)?.name === "AbortError") return;
        setPayload({ pins: [], total: 0, capped: false });
        setFailed(true);
      });
    return () => ctrl.abort();
  }, [qs]);

  /* New payload + live map -> fit bounds, rebuild markers. */
  useEffect(() => {
    if (!ready || !payload) return;
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    pinsRef.current = payload.pins;
    if (payload.pins.length) {
      const bounds = L.latLngBounds(payload.pins.map((p) => [p.lat, p.lon] as [number, number])).pad(0.1);
      map.fitBounds(bounds, { maxZoom: 15 });
    }
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, payload]);

  const shown = payload?.pins.length ?? 0;
  const chipTotal = payload?.total ?? total;
  const showEmpty = payload !== null && payload.pins.length === 0;

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", background: "#F2EBDC" }}>
      <style>{MAP_CSS}</style>
      <div ref={mapDivRef} style={{ position: "absolute", inset: 0 }} aria-label="Map of matching listings" />

      <div
        className="font-mono"
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 1100,
          pointerEvents: "none",
          background: "#FBF7EE",
          border: "2px solid #1D1913",
          borderRadius: 999,
          padding: "6px 12px",
          fontSize: 9,
          letterSpacing: ".18em",
          fontWeight: 700,
          color: "#1D1913",
          boxShadow: "0 6px 14px rgba(20,16,10,.18)",
        }}
      >
        {payload
          ? `SHOWING ${shown}${payload.capped ? ` OF ${chipTotal}` : ""} ON THE MAP`
          : "PLOTTING THE MAP…"}
      </div>

      {showEmpty && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "#FBF7EE",
              border: "2px solid #1D1913",
              borderRadius: 16,
              padding: "18px 22px",
              textAlign: "center",
              maxWidth: 300,
              boxShadow: "0 14px 28px rgba(20,16,10,.24)",
            }}
          >
            <div
              className="font-mono"
              style={{ fontSize: 9, letterSpacing: ".2em", color: "#D9481F", fontWeight: 700 }}
            >
              {failed ? "MAP UNAVAILABLE" : "NO PINS TO SHOW"}
            </div>
            <div
              className="font-serif"
              style={{ fontWeight: 800, fontSize: 18, marginTop: 6, color: "#1D1913", lineHeight: 1.2 }}
            >
              {failed ? "The map lost the signal." : "Nothing to pin for this search."}
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: 9.5,
                letterSpacing: ".12em",
                marginTop: 8,
                color: "rgba(29,25,19,.55)",
              }}
            >
              {failed ? "TRY AGAIN IN A MOMENT" : "LOOSEN A FILTER OR WIDEN THE RADIUS"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
