"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, LayerGroup, Renderer, Layer, Polyline, Polygon, LatLng } from "leaflet";
import type { MapPin } from "@/lib/mls/local";
import { parsePolygon, serializePolygon, simplifyPolygon, polygonBounds, type LonLat } from "@/lib/mls/geo";
import { bySlug } from "@/lib/dfw-data";

/* The Map Room's live pane: a real geographic map (Leaflet + Carto Voyager
   raster tiles) with branded price pins fed by /api/map-pins. Leaflet itself
   is dynamic-imported inside useEffect so it never touches the server bundle.

   Three jobs beyond plotting pins:
   1. Hover photo cards — a React overlay (not a Leaflet popup) fed by
      /api/pin-card, with a photo strip, price-cut chip, and listing link.
      Cards survive the pin→card mouse trip via a 250ms grace timer.
   2. Draw boundary — a pointer-capture overlay records a freehand shape,
      simplifies it (RDP, ≤30 pts), and pushes it into the URL as ?poly=.
   3. Uncapped sets — the server caps at 5000; when a payload is capped (or
      any bbox fetch already narrowed the view), moveend/zoomend refetch with
      a bbox so the visible viewport stays complete.
      Dots render on an explicit canvas renderer so thousands stay smooth. */

type Leaflet = typeof import("leaflet");

type PinPayload = { pins: MapPin[]; total: number; capped: boolean };
/** Payload + the qs that produced it — fitBounds fires only when fitQs is new. */
type LoadedPayload = PinPayload & { fitQs: string };

/** /api/pin-card response shape (pinned contract). */
type PinCard = {
  k: string;
  price: number;
  priceCutFrom: number | null;
  beds: number;
  baths: number;
  sqft: number;
  address: string;
  city: string;
  imgs: string[];
};

type Hovered = { pin: MapPin; x: number; y: number; cw: number; ch: number };

const BUBBLE_LIMIT = 300; // above this many visible, wide zooms fall back to canvas dots
const BUBBLE_ZOOM = 13; // at/after this zoom, visible pins always get bubbles
const BUBBLE_HARD_CAP = 400; // max DOM price bubbles at once — extras stay dots underneath
const CARD_W = 260;
const CARD_EST_H = 268; // photo 150 + body — used only for the flip-below heuristic
const PAYLOAD_CACHE_MAX = 40;

/* Module-level caches — survive remounts, shared across panels. */
const pinCardCache = new Map<string, PinCard>();
const pinPayloadCache = new Map<string, PinPayload>();

function rememberPayload(key: string, data: PinPayload) {
  pinPayloadCache.set(key, data);
  while (pinPayloadCache.size > PAYLOAD_CACHE_MAX) {
    const oldest = pinPayloadCache.keys().next().value;
    if (oldest === undefined) break;
    pinPayloadCache.delete(oldest);
  }
}

function fmtPrice(p: number): string {
  if (p >= 1_000_000) return "$" + (p / 1_000_000).toFixed(1) + "M";
  return "$" + Math.round(p / 1000) + "K";
}

/** Compact dollar delta for the price-cut chip: 10400 -> "$10K". */
function fmtDelta(d: number): string {
  if (d >= 1_000_000) return "$" + (d / 1_000_000).toFixed(1) + "M";
  if (d >= 1000) return "$" + Math.round(d / 1000) + "K";
  return "$" + Math.round(d);
}

function polyFromQs(qs: string): LonLat[] | undefined {
  const raw = new URLSearchParams(qs).get("poly");
  return raw ? parsePolygon(raw) : undefined;
}

const STRIPES =
  "repeating-linear-gradient(45deg, #F6F1E6 0px, #F6F1E6 10px, #EDE4D2 10px, #EDE4D2 20px)";

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
`;

const arrowBtnStyle = (side: "left" | "right"): React.CSSProperties => ({
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  [side]: 8,
  width: 32,
  height: 32,
  borderRadius: 999,
  background: "#F6F1E6",
  border: "1.5px solid #1D1913",
  color: "#1D1913",
  fontSize: 17,
  fontWeight: 700,
  lineHeight: 1,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
});

export default function LiveMapPanel({
  qs,
  activeCitySlug,
  total = 0,
}: {
  /** Serialized current filters (searchFiltersToQueryString output, no page). */
  qs: string;
  activeCitySlug?: string;
  /** Chip fallback before the first payload lands — parents may omit it. */
  total?: number;
}) {
  const router = useRouter();
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<Leaflet | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const dotLayerRef = useRef<LayerGroup | null>(null);
  const bubbleLayerRef = useRef<LayerGroup | null>(null);
  const bubbleKeyRef = useRef(""); // signature of the bubble set currently on the map
  const viewTimerRef = useRef<number | null>(null);
  const canvasRef = useRef<Renderer | null>(null);
  const polyLayerRef = useRef<Polygon | null>(null);
  const pinsRef = useRef<MapPin[]>([]);
  const [ready, setReady] = useState(false);
  const [payload, setPayload] = useState<LoadedPayload | null>(null);
  const [failed, setFailed] = useState(false);

  /* pins fetch plumbing */
  const qsRef = useRef(qs);
  const cappedRef = useRef(false);
  const bboxFollowRef = useRef(false); // any bbox fetch ran for this qs — keep following the viewport
  const fetchSeqRef = useRef(0);
  const pinsCtrlRef = useRef<AbortController | null>(null);
  const moveTimerRef = useRef<number | null>(null);
  const lastFitQsRef = useRef<string | null>(null);
  const payloadRef = useRef<LoadedPayload | null>(null); // for the resize observer — no stale closures
  const fitPendingRef = useRef(false); // a fit was requested while the pane had no size

  /* hover card state */
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [cardData, setCardData] = useState<PinCard | null>(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [badImg, setBadImg] = useState<Record<number, boolean>>({});
  const overPinRef = useRef(false);
  const overCardRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const markerClickTsRef = useRef(0);

  /* draw-boundary state */
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(false);
  const drawActiveRef = useRef(false);
  const drawPtsRef = useRef<LatLng[]>([]);
  const drawLineRef = useRef<Polyline | null>(null);
  const lastDrawPtTsRef = useRef(0);

  const activePoly = polyFromQs(qs);

  /* ---- hover card open/close ---- */

  function cancelCardClose() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function closeCardNow() {
    cancelCardClose();
    overPinRef.current = false;
    overCardRef.current = false;
    setHovered(null);
  }

  /** 250ms grace so the pointer can travel pin -> card without a flicker. */
  function scheduleCardClose() {
    cancelCardClose();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      if (!overPinRef.current && !overCardRef.current) setHovered(null);
    }, 250);
  }

  function openCardForPin(p: MapPin) {
    if (drawingRef.current) return; // draw mode suppresses hover cards
    const map = mapRef.current;
    if (!map) return;
    cancelCardClose();
    overPinRef.current = true;
    const pt = map.latLngToContainerPoint([p.lat, p.lon]);
    const size = map.getSize();
    setHovered({ pin: p, x: pt.x, y: pt.y, cw: size.x, ch: size.y });
  }

  /* ---- marker layers ----

     Two layers so viewport changes never touch the expensive one:
     - dot layer: canvas circleMarkers for ALL pins of a big payload. Built
       exactly once per payload — dots don't depend on the viewport. (The old
       single-layer version rebuilt all 5,000 event-wired markers on every
       moveend AND zoomend, which stacked up during animated zooms and froze
       the tab.)
     - bubble layer: DOM price bubbles for the pins in view, capped at
       BUBBLE_HARD_CAP. Rebuilt on viewport change, but only when the set of
       bubbled pins actually differs from what's already on the map.
     Everything reads refs, so the instances captured by Leaflet's handlers
     stay correct across renders. */

  function wirePin(m: Layer, p: MapPin) {
    m.on("mouseover", () => openCardForPin(p));
    m.on("mouseout", () => {
      overPinRef.current = false;
      scheduleCardClose();
    });
    // touch: first tap opens the card (tap elsewhere = map click = close)
    m.on("click", () => {
      markerClickTsRef.current = Date.now();
      openCardForPin(p);
    });
  }

  function buildBubbleLayer(pins: MapPin[]): LayerGroup {
    const L = leafletRef.current!;
    const layer = L.layerGroup();
    for (const p of pins) {
      const icon = L.divIcon({
        className: "ddfw-pin-wrap",
        html: `<span class="ddfw-pin">${fmtPrice(p.p)}</span>`,
        iconSize: [0, 0],
      });
      const m = L.marker([p.lat, p.lon], { icon });
      wirePin(m, p);
      layer.addLayer(m);
    }
    return layer;
  }

  /* Recomputes which pins deserve DOM bubbles for the current viewport.
     No-ops when the answer matches what's already rendered. */
  function syncBubbles() {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const pins = pinsRef.current;
    if (pins.length <= BUBBLE_LIMIT) return; // small sets are static bubbles — nothing viewport-bound

    const view = map.getBounds();
    const visible: MapPin[] = [];
    for (const p of pins) if (view.contains([p.lat, p.lon])) visible.push(p);
    let want: MapPin[];
    if (map.getZoom() >= BUBBLE_ZOOM) want = visible.slice(0, BUBBLE_HARD_CAP);
    else if (visible.length <= BUBBLE_LIMIT) want = visible;
    else want = []; // wide zoom over a dense area — dots carry the view

    const key = want.map((p) => p.k).join(",");
    if (key === bubbleKeyRef.current) return;
    bubbleKeyRef.current = key;
    bubbleLayerRef.current?.remove();
    bubbleLayerRef.current = null;
    if (want.length) bubbleLayerRef.current = buildBubbleLayer(want).addTo(map);
  }

  /* Full rebuild — payload changes only. */
  function renderMarkers() {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    dotLayerRef.current?.remove();
    dotLayerRef.current = null;
    bubbleLayerRef.current?.remove();
    bubbleLayerRef.current = null;
    bubbleKeyRef.current = "";
    const pins = pinsRef.current;
    if (!pins.length) return;

    if (pins.length <= BUBBLE_LIMIT) {
      bubbleLayerRef.current = buildBubbleLayer(pins).addTo(map);
      return;
    }
    // big set: every pin gets a canvas dot; bubbles overlay the ones in view
    const dots = L.layerGroup();
    for (const p of pins) {
      const m = L.circleMarker([p.lat, p.lon], {
        renderer: canvasRef.current ?? undefined,
        radius: 5,
        color: "#1D1913",
        weight: 1,
        fillColor: "#D9481F",
        fillOpacity: 1,
      });
      wirePin(m, p);
      dots.addLayer(m);
    }
    dots.addTo(map);
    dotLayerRef.current = dots;
    syncBubbles();
  }

  /* ---- pins loading (qs changes + capped-viewport bbox refetches) ---- */

  /* Reads only refs/module state + stable setters, so the first-render
     instance captured by the bootstrap moveend handler stays correct. */
  function loadPins(curQs: string, bbox: string) {
    if (bbox) bboxFollowRef.current = true;
    const key = curQs + "|" + bbox;
    const seq = ++fetchSeqRef.current;
    pinsCtrlRef.current?.abort();
    setFailed(false);
    const cached = pinPayloadCache.get(key);
    if (cached) {
      setPayload({ ...cached, fitQs: curQs });
      return;
    }
    const ctrl = new AbortController();
    pinsCtrlRef.current = ctrl;
    const query = [curQs, bbox ? `bbox=${bbox}` : ""].filter(Boolean).join("&");
    // no-store: the browser must never replay stale pins (the CDN still
    // caches at the edge via the route's s-maxage)
    fetch(`/api/map-pins${query ? `?${query}` : ""}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`map-pins ${r.status}`);
        return r.json();
      })
      .then((j: PinPayload) => {
        if (seq !== fetchSeqRef.current) return; // a newer request superseded us
        const pins = Array.isArray(j?.pins) ? j.pins : [];
        const data: PinPayload = {
          pins,
          total: typeof j?.total === "number" ? j.total : pins.length,
          capped: !!j?.capped,
        };
        rememberPayload(key, data);
        setPayload({ ...data, fitQs: curQs });
      })
      .catch((e: unknown) => {
        if ((e as Error)?.name === "AbortError") return;
        if (seq !== fetchSeqRef.current) return;
        setPayload({ pins: [], total: 0, capped: false, fitQs: curQs });
        setFailed(true);
      });
  }

  /* Fits the camera once per fitQs: a custom boundary owns the frame,
     otherwise the pins do. Reads only refs — the resize observer calls it
     too (after clearing lastFitQsRef, since its last fit ran at 0x0). */
  function fitCameraForPayload(p: LoadedPayload) {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (p.fitQs === lastFitQsRef.current) return;
    lastFitQsRef.current = p.fitQs;
    // hidden pane (mobile list view): mark the fit as owed and apply it when
    // the container gets real dimensions — fitBounds at 0x0 is meaningless
    const size = map.getSize();
    fitPendingRef.current = size.x === 0 || size.y === 0;
    if (fitPendingRef.current) return;
    const poly = polyFromQs(p.fitQs);
    if (poly) {
      const b = polygonBounds(poly);
      map.fitBounds(
        L.latLngBounds([
          [b.minLat, b.minLon],
          [b.maxLat, b.maxLon],
        ]).pad(0.05),
        { maxZoom: 15 }
      );
    } else if (p.pins.length) {
      const bounds = L.latLngBounds(
        p.pins.map((pin) => [pin.lat, pin.lon] as [number, number])
      ).pad(0.1);
      map.fitBounds(bounds, { maxZoom: 15 });
    }
  }

  /* ---- draw boundary ---- */

  function setDrawMode(on: boolean) {
    drawingRef.current = on;
    setDrawing(on);
    const map = mapRef.current;
    if (!map) return;
    if (on) {
      closeCardNow();
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.getContainer().style.cursor = "crosshair";
    } else {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.getContainer().style.cursor = "";
    }
  }

  function cancelDraw() {
    drawActiveRef.current = false;
    drawPtsRef.current = [];
    drawLineRef.current?.remove();
    drawLineRef.current = null;
    setDrawMode(false);
  }

  function latLngFromPointer(e: React.PointerEvent<HTMLDivElement>): LatLng | null {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    return map.containerPointToLatLng(L.point(e.clientX - rect.left, e.clientY - rect.top));
  }

  function onDrawPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawActiveRef.current = true;
    drawPtsRef.current = [];
    lastDrawPtTsRef.current = 0;
    const ll = latLngFromPointer(e);
    if (ll) drawPtsRef.current.push(ll);
    drawLineRef.current?.remove();
    drawLineRef.current = L.polyline(drawPtsRef.current, {
      color: "#1D1913",
      weight: 2,
      dashArray: "6 6",
    }).addTo(map);
  }

  function onDrawPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drawActiveRef.current) return;
    const now = Date.now();
    if (now - lastDrawPtTsRef.current < 25) return; // ~25ms throttle
    lastDrawPtTsRef.current = now;
    const ll = latLngFromPointer(e);
    if (!ll) return;
    drawPtsRef.current.push(ll);
    drawLineRef.current?.setLatLngs(drawPtsRef.current);
  }

  function onDrawPointerUp() {
    if (!drawActiveRef.current) return;
    const raw = drawPtsRef.current;
    drawActiveRef.current = false;
    drawLineRef.current?.remove();
    drawLineRef.current = null;
    setDrawMode(false);
    if (raw.length < 8) return; // too small a gesture — cancel cleanly
    const pts: LonLat[] = raw.map((ll) => [ll.lng, ll.lat]);
    const serialized = serializePolygon(simplifyPolygon(pts, 30));
    const params = new URLSearchParams(qs);
    params.set("poly", serialized);
    params.delete("page");
    router.push("/homes?" + params.toString());
  }

  function clearBoundary() {
    const params = new URLSearchParams(qs);
    params.delete("poly");
    router.push("/homes?" + params.toString());
  }

  /* ---- map bootstrap — once. Leaflet loads client-side only. ---- */
  useEffect(() => {
    let cancelled = false;
    let resizeObs: ResizeObserver | null = null;
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

      // moveend + zoomend both fire per zoom step; coalesce them into one
      // bubble resync (dots never rebuild on viewport changes)
      map.on("moveend zoomend", () => {
        if (pinsRef.current.length <= BUBBLE_LIMIT) return;
        if (viewTimerRef.current !== null) window.clearTimeout(viewTimerRef.current);
        viewTimerRef.current = window.setTimeout(() => {
          viewTimerRef.current = null;
          syncBubbles();
        }, 120);
      });
      // viewport-follow refetch: capped payloads need it, and once any bbox
      // fetch ran the payload only covers that box, so every later viewport
      // needs its own fetch too. zoomend included — an animated zoom can
      // settle without firing moveend. The payload cache dedupes repeats.
      map.on("moveend zoomend", () => {
        if (!cappedRef.current && !bboxFollowRef.current) return;
        if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current);
        moveTimerRef.current = window.setTimeout(() => {
          moveTimerRef.current = null;
          const m = mapRef.current;
          if (!m) return;
          // a hidden pane collapses to 0x0 and invalidateSize fires moveend —
          // its degenerate bounds would silently fetch the FULL result set
          const size = m.getSize();
          if (size.x === 0 || size.y === 0) return;
          const b = m.getBounds();
          if (b.getWest() >= b.getEast() || b.getSouth() >= b.getNorth()) return;
          const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
            .map((n) => n.toFixed(5))
            .join(",");
          loadPins(qsRef.current, bbox);
        }, 400);
      });
      map.on("movestart", () => closeCardNow());
      // tap/click on bare map closes the card (marker clicks bubble here too)
      map.on("click", () => {
        if (Date.now() - markerClickTsRef.current < 200) return;
        closeCardNow();
      });

      mapRef.current = map;

      // hidden-pane resilience: on mobile this map can mount inside a
      // display:none pane, so Leaflet initializes at 0x0 and renders blank.
      // Any resize gets invalidateSize; the 0x0 -> visible transition also
      // refits the camera, since the original fit ran against a zero box.
      const container = mapDivRef.current!;
      resizeObs = new ResizeObserver(() => {
        const m = mapRef.current;
        const el = mapDivRef.current;
        if (!m || !el) return;
        const hasSize = el.clientWidth > 0 && el.clientHeight > 0;
        m.invalidateSize();
        // apply an owed fit only — a pane that was hidden AFTER a real fit
        // keeps the user's camera across list <-> map round trips
        if (hasSize && fitPendingRef.current && payloadRef.current) {
          lastFitQsRef.current = null;
          fitCameraForPayload(payloadRef.current);
        }
      });
      resizeObs.observe(container);

      setReady(true);
    })();
    return () => {
      cancelled = true;
      resizeObs?.disconnect();
      if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current);
      if (viewTimerRef.current !== null) window.clearTimeout(viewTimerRef.current);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      pinsCtrlRef.current?.abort();
      drawLineRef.current = null;
      polyLayerRef.current = null;
      dotLayerRef.current = null;
      bubbleLayerRef.current = null;
      mapRef.current?.remove(); // detaches all map + layer listeners
      mapRef.current = null;
      leafletRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Escape closes the card; while drawing it cancels the draw instead. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (drawingRef.current) cancelDraw();
      else closeCardNow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Pins — refetch whenever the serialized filters change (bbox reset). */
  useEffect(() => {
    qsRef.current = qs;
    bboxFollowRef.current = false; // a new filter set starts from the full fetch
    loadPins(qs, "");
    return () => pinsCtrlRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  /* New payload + live map -> maybe fit bounds, rebuild markers.
     fitBounds fires ONLY when the qs behind the payload is new — bbox
     refetches while panning reuse the same qs and never zoom-fight. */
  useEffect(() => {
    if (!ready || !payload) return;
    if (!leafletRef.current || !mapRef.current) return;
    pinsRef.current = payload.pins;
    payloadRef.current = payload;
    cappedRef.current = payload.capped;
    fitCameraForPayload(payload);
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, payload]);

  /* Active custom boundary -> dashed ink polygon with a faint orange wash. */
  useEffect(() => {
    if (!ready) return;
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    polyLayerRef.current?.remove();
    polyLayerRef.current = null;
    const poly = polyFromQs(qs);
    if (poly) {
      polyLayerRef.current = L.polygon(
        poly.map(([lon, lat]) => [lat, lon] as [number, number]),
        {
          color: "#1D1913",
          weight: 2,
          dashArray: "6 6",
          fillColor: "#D9481F",
          fillOpacity: 0.05,
        }
      ).addTo(map);
    }
  }, [ready, qs]);

  /* Hover card data — module cache first, else /api/pin-card. */
  const hoverKey = hovered?.pin.k ?? null;
  useEffect(() => {
    setPhotoIdx(0);
    setBadImg({});
    if (!hoverKey) {
      setCardData(null);
      return;
    }
    const cached = pinCardCache.get(hoverKey);
    if (cached) {
      setCardData(cached);
      return;
    }
    setCardData(null); // skeleton
    const ctrl = new AbortController();
    fetch(`/api/pin-card?k=${encodeURIComponent(hoverKey)}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`pin-card ${r.status}`);
        return r.json();
      })
      .then((j: PinCard) => {
        pinCardCache.set(hoverKey, j);
        setCardData(j);
      })
      .catch(() => {
        /* card silently stays a skeleton; leaving the pin clears it */
      });
    return () => ctrl.abort();
  }, [hoverKey]);

  const shown = payload?.pins.length ?? 0;
  const chipTotal = payload?.total ?? total;
  const showEmpty = payload !== null && payload.pins.length === 0;

  const chipText = !payload
    ? "PLOTTING THE MAP…"
    : payload.capped
      ? `SHOWING ${shown.toLocaleString("en-US")} IN VIEW OF ${chipTotal.toLocaleString("en-US")} — ZOOM OR FILTER FOR MORE`
      : `${shown.toLocaleString("en-US")} ON THE MAP${activePoly ? " · CUSTOM BOUNDARY" : ""}`;

  /* card geometry: centered over the pin, clamped to the container, and
     flipped below the pin when the pin rides too close to the top edge */
  let cardPos: React.CSSProperties | null = null;
  if (hovered) {
    const left = Math.max(4, Math.min(hovered.x - CARD_W / 2, hovered.cw - CARD_W - 8));
    const flipBelow = hovered.y < CARD_EST_H + 24;
    cardPos = flipBelow
      ? { left, top: Math.max(8, Math.min(hovered.y + 16, hovered.ch - 120)) }
      : { left, bottom: hovered.ch - hovered.y + 16 };
  }

  const imgs = cardData?.imgs ?? [];
  const nImgs = imgs.length;
  const cutDelta =
    cardData && cardData.priceCutFrom !== null ? cardData.priceCutFrom - cardData.price : 0;

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", background: "#F2EBDC" }}>
      <style>{MAP_CSS}</style>
      <div ref={mapDivRef} style={{ position: "absolute", inset: 0 }} aria-label="Map of matching listings" />

      {/* count chip — top left, clear of Leaflet's zoom control */}
      <div
        className="font-mono"
        style={{
          position: "absolute",
          top: 10,
          left: 54,
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
          maxWidth: "min(62%, 460px)",
        }}
      >
        {chipText}
      </div>

      {/* boundary controls — top right */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 1150,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        {activePoly && !drawing ? (
          <button
            type="button"
            className="font-mono"
            onClick={clearBoundary}
            style={{
              background: "#FBF7EE",
              border: "1.5px solid #D9481F",
              color: "#D9481F",
              borderRadius: 999,
              padding: "7px 13px",
              fontSize: 9.5,
              letterSpacing: ".16em",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 6px 14px rgba(20,16,10,.18)",
            }}
          >
            ✕ CLEAR BOUNDARY
          </button>
        ) : (
          <button
            type="button"
            className="font-mono"
            onClick={() => (drawing ? cancelDraw() : setDrawMode(true))}
            style={{
              background: drawing ? "#1D1913" : "#FBF7EE",
              border: "1.5px solid #1D1913",
              color: drawing ? "#F6F1E6" : "#1D1913",
              borderRadius: 999,
              padding: "7px 13px",
              fontSize: 9.5,
              letterSpacing: ".16em",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 6px 14px rgba(20,16,10,.18)",
            }}
          >
            {drawing ? "✕ CANCEL DRAWING" : "✏ DRAW BOUNDARY"}
          </button>
        )}
      </div>

      {/* draw-mode hint chip */}
      {drawing && (
        <div
          className="font-mono"
          style={{
            position: "absolute",
            top: 52,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1550,
            pointerEvents: "none",
            background: "#1D1913",
            color: "#F6F1E6",
            borderRadius: 999,
            padding: "7px 14px",
            fontSize: 9,
            letterSpacing: ".16em",
            fontWeight: 700,
            whiteSpace: "nowrap",
            boxShadow: "0 8px 18px rgba(20,16,10,.3)",
          }}
        >
          DRAW A SHAPE AROUND YOUR AREA — RELEASE TO SEARCH
        </div>
      )}

      {/* draw capture surface — sits above the map, records the gesture */}
      {drawing && (
        <div
          onPointerDown={onDrawPointerDown}
          onPointerMove={onDrawPointerMove}
          onPointerUp={onDrawPointerUp}
          onPointerCancel={cancelDraw}
          style={{
            position: "absolute",
            inset: 0,
            // above the mobile MAP/LIST toggle (1400) — a draw stroke must
            // never land on the toggle mid-gesture
            zIndex: 1500,
            cursor: "crosshair",
            touchAction: "none",
            background: "transparent",
          }}
        />
      )}

      {/* hover photo card — React overlay, not a Leaflet popup */}
      {hovered && cardPos && !drawing && (
        <div
          onMouseEnter={() => {
            overCardRef.current = true;
            cancelCardClose();
          }}
          onMouseLeave={() => {
            overCardRef.current = false;
            scheduleCardClose();
          }}
          style={{
            position: "absolute",
            ...cardPos,
            width: CARD_W,
            zIndex: 1600,
            background: "#FBF7EE",
            border: "2px solid #1D1913",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 16px 38px rgba(20,16,10,.28)",
          }}
        >
          {cardData ? (
            <>
              {/* photo strip */}
              <div style={{ position: "relative", width: "100%", height: 150, background: STRIPES }}>
                {nImgs > 0 && !badImg[photoIdx] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imgs[photoIdx]}
                    alt={cardData.address}
                    onError={() => setBadImg((b) => ({ ...b, [photoIdx]: true }))}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                )}
                {cutDelta > 0 && (
                  <div
                    className="font-mono"
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      background: "#D9481F",
                      color: "#F6F1E6",
                      borderRadius: 999,
                      padding: "3px 8px",
                      fontSize: 8.5,
                      letterSpacing: ".12em",
                      fontWeight: 700,
                    }}
                  >
                    PRICE CUT: -{fmtDelta(cutDelta)}
                  </div>
                )}
                {nImgs > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Previous photo"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPhotoIdx((i) => (i - 1 + nImgs) % nImgs);
                      }}
                      style={arrowBtnStyle("left")}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      aria-label="Next photo"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPhotoIdx((i) => (i + 1) % nImgs);
                      }}
                      style={arrowBtnStyle("right")}
                    >
                      ›
                    </button>
                    <div
                      style={{
                        position: "absolute",
                        bottom: 8,
                        left: "50%",
                        transform: "translateX(-50%)",
                        display: "flex",
                        gap: 5,
                      }}
                    >
                      {imgs.map((_, i) => (
                        <span
                          key={i}
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: i === photoIdx ? "#D9481F" : "rgba(246,241,230,.85)",
                            border: "1px solid rgba(29,25,19,.45)",
                          }}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
              {/* body */}
              <div style={{ padding: "10px 12px 12px" }}>
                <div className="font-serif" style={{ fontWeight: 900, fontSize: 21, color: "#D9481F" }}>
                  ${cardData.price.toLocaleString("en-US")}
                </div>
                <div
                  className="font-mono"
                  style={{ fontSize: 9, letterSpacing: ".14em", marginTop: 3, color: "rgba(29,25,19,.65)" }}
                >
                  {cardData.beds} BDS · {cardData.baths} BA · {cardData.sqft.toLocaleString("en-US")} SQFT
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 5, color: "#1D1913", lineHeight: 1.3 }}>
                  {cardData.address}
                  {cardData.city ? `, ${cardData.city}` : ""}
                </div>
                <a
                  href={`/listing/${encodeURIComponent(cardData.k)}`}
                  className="font-mono"
                  style={{
                    display: "inline-block",
                    marginTop: 8,
                    color: "#D9481F",
                    fontSize: 9.5,
                    letterSpacing: ".14em",
                    fontWeight: 700,
                    textDecoration: "none",
                    borderBottom: "1.5px solid #D9481F",
                    paddingBottom: 1,
                  }}
                >
                  VIEW LISTING →
                </a>
              </div>
            </>
          ) : (
            /* branded skeleton while /api/pin-card loads */
            <div>
              <div style={{ width: "100%", height: 150, background: STRIPES }} />
              <div style={{ padding: "10px 12px 14px" }}>
                <div style={{ height: 20, width: 120, borderRadius: 6, background: STRIPES }} />
                <div style={{ height: 10, width: 180, borderRadius: 6, background: STRIPES, marginTop: 8 }} />
                <div style={{ height: 10, width: 150, borderRadius: 6, background: STRIPES, marginTop: 6 }} />
              </div>
            </div>
          )}
        </div>
      )}

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
