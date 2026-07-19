"use client";
/* CanvasFrame — the full-fidelity page canvas at the center of the Visual
   Builder. A same-origin iframe loads the REAL page through the admin-gated
   preview route (Draft Mode + the __bb builder cookie), so the canvas shows
   the actual production components, typography, images, and responsive
   behavior — never a mock.

   The frame owns:
     · the strictly-validated postMessage channel (event.source must be our
       iframe's contentWindow AND event.origin our own origin; every payload
       goes through parseCanvasMsg — anything else is dropped)
     · device width + zoom scaling (fit / 100 / 75 / 50) with the canvas
       scrolling inside its own viewport, like a real browser window
     · every visible load state: loading, auth failure, unknown route,
       draft/server failure, bridge timeout/disconnect, runtime errors —
       each with RETRY and OPEN REAL PAGE actions. A blank canvas is never
       a valid state. */
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, ExternalLink, TriangleAlert, X } from "lucide-react";
import {
  parseCanvasMsg,
  canvasStatusNext,
  CANVAS_ERROR_TEXT,
  type CanvasMsg,
  type CanvasStatus,
  type ShellMsg,
} from "@/lib/editor/bridge-protocol";

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const CARD = "#FBF7EE";
const ORANGE = "#D9481F";
const ORANGE_DARK = "#C13E17";

export interface CanvasApi {
  send: (m: ShellMsg) => void;
  reload: () => void;
}

export default function CanvasFrame({
  route,
  deviceWidth,
  zoom,
  apiRef,
  onMsg,
  onReady,
}: {
  /** the real public path to render (e.g. "/", "/city/frisco") */
  route: string;
  deviceWidth: number;
  zoom: "fit" | number;
  apiRef: React.MutableRefObject<CanvasApi | null>;
  onMsg: (m: CanvasMsg) => void;
  /** fires each time the bridge (re)connects — the shell re-inits + resyncs */
  onReady: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<CanvasStatus>({ s: "loading" });
  const statusRef = useRef(status);
  statusRef.current = status;
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [colWidth, setColWidth] = useState(1200);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const src = `/api/admin/editor/preview?route=${encodeURIComponent(route)}&builder=1&n=${nonce}`;
  const openReal = `/api/admin/editor/preview?route=${encodeURIComponent(route)}`;

  const apply = useCallback((ev: Parameters<typeof canvasStatusNext>[1]) => {
    setStatus((prev) => canvasStatusNext(prev, ev));
  }, []);

  const reload = useCallback(() => {
    setRuntimeError(null);
    apply({ kind: "load-start" });
    setNonce((n) => n + 1);
  }, [apply]);

  useEffect(() => {
    apiRef.current = {
      send: (m: ShellMsg) => {
        const w = iframeRef.current?.contentWindow;
        if (w) w.postMessage(m, window.location.origin);
      },
      reload,
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, reload]);

  /* route change = fresh load cycle */
  useEffect(() => {
    setRuntimeError(null);
    apply({ kind: "load-start" });
    // preflight: the preview API only REDIRECTS on success — a readable
    // response means it refused (404 signed-out, 400 unknown route, 5xx)
    let alive = true;
    fetch(`/api/admin/editor/preview?route=${encodeURIComponent(route)}&builder=1`, { redirect: "manual", cache: "no-store" })
      .then((res) => {
        if (!alive) return;
        if (res.type === "opaqueredirect" || res.status === 0) return; // healthy
        apply({ kind: "preflight", httpStatus: res.status });
      })
      .catch(() => undefined);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => apply({ kind: "timeout" }), 25_000);
    return () => {
      alive = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, nonce]);

  /* the ONLY message intake: our frame, our origin, our schema. Registered
     exactly ONCE and routed through refs — re-registering on prop identity
     churn is how duplicate/stale listeners are born, and every message
     would then be double-processed. */
  const onMsgRef = useRef(onMsg);
  onMsgRef.current = onMsg;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const msg = parseCanvasMsg(e.data);
      if (!msg) return;
      if (msg.t === "ready") {
        apply({ kind: "bridge-ready" });
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        onReadyRef.current();
      }
      if (msg.t === "error") setRuntimeError(msg.message);
      onMsgRef.current(msg);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [apply]);

  /* column width for fit-zoom */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const en of entries) setColWidth(en.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = zoom === "fit" ? Math.min(1, (colWidth - 36) / deviceWidth) : zoom;
  const frameH = containerRef.current?.clientHeight ?? 800;

  return (
    <div ref={containerRef} style={{ position: "relative", height: "100%", display: "flex", justifyContent: "center", alignItems: "flex-start", overflow: "hidden", background: "#E9E0CC" }}>
      {/* the scaled real-page viewport */}
      <div style={{ width: deviceWidth * scale, height: "100%", position: "relative", boxShadow: "0 10px 40px rgba(29,25,19,.28)" }}>
        <iframe
          ref={iframeRef}
          key={`${route}::${nonce}`}
          src={src}
          title={`Page canvas — ${route}`}
          style={{
            width: deviceWidth,
            height: frameH / scale,
            border: "none",
            background: CREAM,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            display: "block",
          }}
        />
      </div>

      {/* runtime (post-ready) error banner — visible but non-destructive */}
      {runtimeError && status.s === "ready" && (
        <div className="font-mono" style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 20, display: "flex", alignItems: "center", gap: 10, background: INK, color: "#F1A08A", borderRadius: 8, padding: "8px 12px", fontSize: 11, maxWidth: "80%" }}>
          <TriangleAlert size={14} />
          <span>CANVAS ERROR: {runtimeError}</span>
          <button type="button" onClick={reload} title="Reload canvas" style={{ border: "none", background: "none", color: CREAM, cursor: "pointer", display: "flex" }}>
            <RefreshCw size={13} />
          </button>
          <button type="button" onClick={() => setRuntimeError(null)} title="Dismiss" style={{ border: "none", background: "none", color: CREAM, cursor: "pointer", display: "flex" }}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* load states — never a silent blank canvas */}
      {status.s !== "ready" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", background: status.s === "loading" ? "rgba(233,224,204,.75)" : "rgba(233,224,204,.94)" }}>
          {status.s === "loading" ? (
            <div className="font-mono" role="status" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, color: "rgba(29,25,19,.7)", fontSize: 12, letterSpacing: ".14em", fontWeight: 700 }}>
              <span className="bb-spin" style={{ display: "inline-flex" }}>
                <RefreshCw size={26} />
              </span>
              LOADING THE REAL PAGE…
              <span style={{ fontWeight: 400, letterSpacing: ".06em", fontSize: 11 }}>{route}</span>
            </div>
          ) : (
            <div style={{ background: CARD, border: `2px solid ${INK}`, borderRadius: 16, padding: "26px 30px", maxWidth: 460, textAlign: "center" }}>
              <TriangleAlert size={26} color={ORANGE_DARK} style={{ margin: "0 auto" }} />
              <div className="font-mono" style={{ marginTop: 12, fontSize: 12, fontWeight: 700, letterSpacing: ".1em", color: ORANGE_DARK }}>
                CANVAS UNAVAILABLE
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.65, color: "rgba(29,25,19,.8)" }}>
                {CANVAS_ERROR_TEXT[status.code]}
                {status.detail ? ` (${status.detail})` : ""}
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }}>
                <button
                  type="button"
                  onClick={reload}
                  className="font-mono"
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `2px solid ${INK}`, borderRadius: 999, padding: "9px 16px", fontSize: 11.5, fontWeight: 700, letterSpacing: ".08em", cursor: "pointer", background: ORANGE, color: CREAM }}
                >
                  <RefreshCw size={13} /> RETRY
                </button>
                <a
                  href={openReal}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono"
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `2px solid ${INK}`, borderRadius: 999, padding: "9px 16px", fontSize: 11.5, fontWeight: 700, letterSpacing: ".08em", cursor: "pointer", background: CARD, color: INK, textDecoration: "none" }}
                >
                  <ExternalLink size={13} /> OPEN REAL PAGE
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes bbspin{to{transform:rotate(360deg)}} .bb-spin{animation:bbspin 1.1s linear infinite} @media (prefers-reduced-motion: reduce){.bb-spin{animation:none}}`}</style>
    </div>
  );
}
