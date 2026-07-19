"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  counties,
  lakes,
  roads,
  landmarks,
  cities,
  bySlug,
  countyById,
  citiesInCounty,
  project,
  pts,
  fmtPop,
  median,
  VB_W,
  VB_H,
} from "@/lib/dfw-data";
import { fmtPrice } from "@/lib/market/core";
import { pal } from "@/lib/theme";

const r1 = (n: number) => Math.round(n * 10) / 10;

/* liveMls arrives as a prop — process.env.MLS_PROVIDER is server-only, so
   the server parent (app/page.tsx) passes the flag across the boundary. */
export default function InteractiveMap({
  liveMls = false,
  prices,
  stats,
  pricesLive = false,
  pricesAsOf,
  introOverride,
}: {
  liveMls?: boolean;
  /* canonical city figures from the homepage's metric fetch — the map holds
     no market numbers of its own (editorial fallback per city) */
  prices?: Record<string, number>;
  stats?: Record<string, { ppsf?: number; dom?: number }>;
  pricesLive?: boolean;
  pricesAsOf?: string;
  introOverride?: React.ReactNode;
}) {
  // the prices map (when supplied) is the whole truth — a missing entry
  // means the canonical layer omitted the median; render nothing for it
  const priceOf = (slug: string): number | undefined =>
    prices ? prices[slug] : bySlug[slug]?.price;
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const [hoverCity, setHoverCity] = useState<string | null>(null);
  const [hoverSrc, setHoverSrc] = useState<"map" | "panel" | null>(null);
  const [hoverCounty, setHoverCounty] = useState<string | null>(null);
  const [selCounty, setSelCounty] = useState<string | null>(null);
  const [attract, setAttract] = useState<string | null>(null);

  // attract mode — idle cities "blip" to invite exploration
  useEffect(() => {
    const iv = setInterval(() => {
      if (hoverCity) return;
      const pick = cities[Math.floor(Math.random() * cities.length)].slug;
      setAttract(pick);
    }, 2400);
    return () => clearInterval(iv);
  }, [hoverCity]);

  const hoverObj = hoverCity ? bySlug[hoverCity] : null;
  const hiCounty = hoverCounty || (hoverObj ? hoverObj.county : null) || selCounty;

  const spotObj = hoverObj && hoverSrc === "map" ? hoverObj : null;
  const selObj = !spotObj && selCounty ? countyById[selCounty] : null;
  const spotShow = !!spotObj;
  const cpShow = !!selObj;
  const listShow = !spotShow && !cpShow;

  const nav = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(href);
  };

  const onMapMove = (e: React.MouseEvent) => {
    const wrap = wrapRef.current;
    const tip = tipRef.current;
    if (!wrap || !tip) return;
    const rect = wrap.getBoundingClientRect();
    const x = Math.min(e.clientX - rect.left, rect.width - 200);
    const y = Math.max(e.clientY - rect.top, 84);
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  };

  return (
    <section
      id="map"
      style={{ maxWidth: 1380, margin: "0 auto", padding: "92px 4vw 60px" }}
    >
      <div
        data-reveal="1"
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div>
          <div
            className="font-mono"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".32em",
              color: "#D9481F",
              marginBottom: 14,
            }}
          >
            01 — THE MAP
          </div>
          <h2
            className="font-serif"
            style={{
              margin: 0,
              fontWeight: 800,
              fontSize: "clamp(38px,4.8vw,64px)",
              lineHeight: 1.02,
              letterSpacing: "-.01em",
            }}
          >
            The Metroplex, mapped.
          </h2>
        </div>
        {introOverride ? (
          <div style={{ margin: "0 0 6px", maxWidth: 340, fontSize: 15, lineHeight: 1.6, color: "rgba(29,25,19,.65)" }}>
            {introOverride}
          </div>
        ) : (
          <p
            style={{
              margin: "0 0 6px",
              maxWidth: 340,
              fontSize: 15,
              lineHeight: 1.6,
              color: "rgba(29,25,19,.65)",
            }}
          >
            Hover any city to light it up. Click through for the full report:
            market, neighborhoods, schools, commutes.
          </p>
        )}
      </div>

      <div
        data-reveal="1"
        style={{
          border: "2px solid #1D1913",
          borderRadius: 22,
          overflow: "hidden",
          display: "flex",
          flexWrap: "wrap",
          background: pal.panel,
          boxShadow: "0 24px 60px rgba(29,25,19,.14)",
        }}
      >
        {/* map canvas */}
        <div
          ref={wrapRef}
          onMouseMove={onMapMove}
          style={{
            flex: "1.72",
            minWidth: "min(620px,92vw)",
            position: "relative",
            padding: "20px 8px 12px",
            backgroundImage: `radial-gradient(${pal.grid} 1px, transparent 1px)`,
            backgroundSize: "26px 26px",
          }}
        >
          <div
            className="font-mono"
            style={{
              position: "absolute",
              top: 18,
              left: 26,
              fontSize: 10,
              letterSpacing: ".26em",
              color: pal.faint,
            }}
          >
            DALLAS–FORT WORTH METROPLEX
          </div>
          <div
            className="font-mono"
            style={{
              position: "absolute",
              top: 18,
              right: 26,
              fontSize: 11,
              letterSpacing: ".14em",
              color: pal.faint,
            }}
          >
            N ↑
          </div>

          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ width: "100%", display: "block" }}>
            <g style={{ filter: "drop-shadow(0 14px 22px rgba(20,16,10,.22))" }}>
              {counties.map((co) => (
                <polygon
                  key={co.id}
                  points={pts(co.poly)}
                  onMouseEnter={() => setHoverCounty(co.id)}
                  onMouseLeave={() => setHoverCounty(null)}
                  onClick={() =>
                    setSelCounty((s) => (s === co.id ? null : co.id))
                  }
                  style={{
                    fill: hiCounty === co.id ? pal.hi : pal.tones[co.tone],
                    stroke: pal.stroke,
                    strokeWidth: 1.7,
                    strokeLinejoin: "round",
                    cursor: "pointer",
                    transition: "fill .35s",
                  }}
                />
              ))}
            </g>

            {lakes.map((lk) => (
              <polygon
                key={lk.name}
                points={pts(lk.pts)}
                style={{
                  fill: pal.lake,
                  stroke: pal.lake,
                  strokeWidth: 11,
                  strokeLinejoin: "round",
                  strokeLinecap: "round",
                  pointerEvents: "none",
                  opacity: 0.92,
                }}
              />
            ))}

            <g>
              {roads.map((rd) => (
                <polyline
                  key={rd.n}
                  points={pts(rd.pts)}
                  style={{
                    fill: "none",
                    stroke: pal.road,
                    strokeWidth: rd.w || 1.4,
                    strokeDasharray: rd.dash || "none",
                    strokeLinejoin: "round",
                    strokeLinecap: "round",
                    pointerEvents: "none",
                  }}
                />
              ))}
            </g>

            {/* county labels */}
            <g>
              {counties.map((co) => {
                const p = project(co.label);
                return (
                  <text
                    key={co.id}
                    x={Math.round(p[0])}
                    y={Math.round(p[1])}
                    style={{
                      fontFamily: "var(--font-archivo),sans-serif",
                      fontWeight: 800,
                      fontSize: "15px",
                      letterSpacing: ".3em",
                      fill: pal.cLabel,
                      opacity: co.core ? 1 : 0.55,
                      textAnchor: "middle",
                      pointerEvents: "none",
                    }}
                  >
                    {co.labelText}
                  </text>
                );
              })}
            </g>

            {/* lake labels */}
            <g>
              {lakes
                .filter((lk) => lk.label)
                .map((lk) => {
                  const p = project(lk.label!);
                  return (
                    <text
                      key={lk.name}
                      x={Math.round(p[0])}
                      y={Math.round(p[1])}
                      style={{
                        fontFamily: "var(--font-playfair),serif",
                        fontStyle: "italic",
                        fontSize: "10.5px",
                        letterSpacing: ".06em",
                        fill: pal.lakeText,
                        textAnchor: "middle",
                        pointerEvents: "none",
                      }}
                    >
                      {lk.name}
                    </text>
                  );
                })}
            </g>

            {/* landmarks */}
            <g>
              {landmarks.map((lm) => {
                const p = project(lm.ll);
                return (
                  <g key={lm.n} style={{ pointerEvents: "none" }}>
                    <rect
                      x={Math.round(p[0] - 3.7)}
                      y={Math.round(p[1] - 3.7)}
                      width={7.4}
                      height={7.4}
                      style={{
                        fill: "#D9481F",
                        transform: "rotate(45deg)",
                        transformBox: "fill-box",
                        transformOrigin: "center",
                      }}
                    />
                    <text
                      x={Math.round(p[0] + (lm.dx ?? 0))}
                      y={Math.round(p[1] + (lm.dy ?? 16))}
                      style={{
                        fontFamily: "ui-monospace,Menlo,monospace",
                        fontSize: "8.4px",
                        letterSpacing: ".12em",
                        fill: pal.lmText,
                        textAnchor:
                          lm.ta === "s" ? "start" : lm.ta === "e" ? "end" : "middle",
                      }}
                    >
                      {lm.n}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* cities */}
            {cities.map((c) => {
              const p = project(c.ll);
              const hovered = hoverCity === c.slug;
              const blip = !hoverCity && attract === c.slug;
              const dim = !!hoverCity && !hovered;
              const big = c.fs >= 15;
              const x = r1(p[0]);
              const y = r1(p[1]);
              const href = `/city/${c.slug}`;
              return (
                <a
                  key={c.slug}
                  href={href}
                  onClick={nav(href)}
                  className="map-city"
                  onMouseEnter={() => {
                    setHoverCity(c.slug);
                    setHoverSrc("map");
                    setAttract(null);
                  }}
                  onMouseLeave={() => {
                    setHoverCity(null);
                    setHoverSrc(null);
                  }}
                >
                  {hovered && (
                    <>
                      <circle
                        cx={x}
                        cy={y}
                        r={16}
                        style={{
                          fill: "none",
                          stroke: "#D9481F",
                          strokeWidth: 2.2,
                          transformBox: "fill-box",
                          transformOrigin: "center",
                          animation:
                            "ringPulse 1.5s cubic-bezier(.2,.8,.4,1) infinite",
                          pointerEvents: "none",
                        }}
                      />
                      <circle
                        cx={x}
                        cy={y}
                        r={10}
                        style={{ fill: "rgba(217,72,31,.16)", pointerEvents: "none" }}
                      />
                    </>
                  )}
                  {blip && (
                    <circle
                      cx={x}
                      cy={y}
                      r={14}
                      style={{
                        fill: "none",
                        stroke: pal.blip,
                        strokeWidth: 1.6,
                        transformBox: "fill-box",
                        transformOrigin: "center",
                        animation: "blipPulse 2.4s ease-out infinite",
                        pointerEvents: "none",
                      }}
                    />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={hovered ? 6 : big ? 5 : 3.8}
                    style={{
                      fill: hovered ? "#D9481F" : pal.dot,
                      stroke: hovered ? "rgba(217,72,31,.35)" : pal.dotRing,
                      strokeWidth: 1.4,
                      transition: "fill .2s",
                    }}
                  />
                  <text
                    x={r1(p[0] + c.dx)}
                    y={r1(p[1] + c.dy)}
                    style={{
                      fontFamily: "var(--font-archivo),sans-serif",
                      fontWeight: hovered ? 800 : 700,
                      fontSize: c.fs + "px",
                      letterSpacing: ".07em",
                      textTransform: "uppercase",
                      fill: hovered ? "#C13A12" : pal.label,
                      textAnchor:
                        c.anchor === "m" ? "middle" : c.anchor === "s" ? "start" : "end",
                      opacity: dim ? 0.34 : 1,
                      transition: "fill .2s,opacity .3s",
                      paintOrder: "stroke",
                      stroke: pal.haloStroke,
                      strokeWidth: "3px",
                      strokeLinejoin: "round",
                    }}
                  >
                    {c.name}
                  </text>
                  <circle cx={x} cy={y} r={15} style={{ fill: "rgba(0,0,0,0)" }} />
                </a>
              );
            })}
          </svg>

          {/* cursor tooltip */}
          <div
            ref={tipRef}
            style={{
              position: "absolute",
              left: -300,
              top: 0,
              pointerEvents: "none",
              zIndex: 5,
              transform: "translate(16px,-112%)",
              opacity: spotShow ? 1 : 0,
              transition: "opacity .18s",
            }}
          >
            <div
              style={{
                background: "#1D1913",
                color: "#F6F1E6",
                borderRadius: 12,
                padding: "11px 14px 12px",
                minWidth: 158,
                boxShadow: "0 14px 30px rgba(20,16,10,.35)",
                border: "1px solid rgba(246,241,230,.14)",
              }}
            >
              <div
                className="font-mono"
                style={{
                  fontSize: 8.5,
                  letterSpacing: ".22em",
                  color: "#E88D6B",
                  marginBottom: 4,
                }}
              >
                {spotObj ? countyById[spotObj.county].name.toUpperCase() : ""} ·{" "}
                {spotObj ? fmtPop(spotObj.pop) : ""} PEOPLE
              </div>
              <div
                className="font-serif"
                style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.1 }}
              >
                {spotObj ? spotObj.name : ""}
              </div>
              <div
                className="font-mono"
                style={{
                  fontSize: 10.5,
                  marginTop: 5,
                  color: "rgba(246,241,230,.85)",
                }}
              >
                {(() => {
                  const v = spotObj ? priceOf(spotObj.slug) : undefined;
                  return v ? `${fmtPrice(v)} median · ` : "";
                })()}
                <span style={{ color: "#E88D6B" }}>open report →</span>
              </div>
            </div>
          </div>
        </div>

        {/* sidebar */}
        <div
          style={{
            flex: 1,
            minWidth: "min(320px,92vw)",
            borderLeft: "2px solid #1D1913",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "30px 30px",
            background: pal.side,
          }}
        >
          {spotObj && (
            <Spotlight
              slug={spotObj.slug}
              price={priceOf(spotObj.slug)}
              ppsf={stats?.[spotObj.slug]?.ppsf}
              dom={stats?.[spotObj.slug]?.dom}
            />
          )}
          {selObj && (
            <CountyPanel
              id={selObj.id}
              priceOf={priceOf}
              onClear={() => {
                setSelCounty(null);
                setHoverCounty(null);
              }}
              onCityEnter={(slug) => {
                setHoverCity(slug);
                setHoverSrc("panel");
                setAttract(null);
              }}
              onCityLeave={() => {
                setHoverCity(null);
                setHoverSrc(null);
              }}
            />
          )}
          {listShow && (
            <CountyList
              priceOf={priceOf}
              onEnter={setHoverCounty}
              onLeave={() => setHoverCounty(null)}
              onClick={setSelCounty}
            />
          )}
        </div>
      </div>

      <div
        data-reveal="1"
        className="font-mono"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginTop: 14,
          fontSize: 10,
          letterSpacing: ".18em",
          color: "rgba(29,25,19,.5)",
        }}
      >
        <span>SIMPLIFIED COUNTY GEOMETRY · NOT FOR NAVIGATION</span>
        <span style={{ color: "#D9481F" }}>
          {pricesLive
            ? "CITY MEDIANS: ACTIVE LIST PRICES · NTREIS"
            : liveMls
            ? "CITY FIGURES: EDITORIAL MEDIANS — LIVE LISTINGS ON CITY PAGES"
            : "ALL FIGURES ARE PLACEHOLDERS — REPLACE WITH LIVE MLS DATA"}
        </span>
      </div>
    </section>
  );
}

/* ---------------- sidebar sub-views ---------------- */

const statCell = (label: string, value: string, color: string) => (
  <div style={{ background: pal.side, padding: "13px 15px" }}>
    <div
      className="font-mono"
      style={{ fontSize: 9, letterSpacing: ".18em", color: pal.textFaint }}
    >
      {label}
    </div>
    <div
      className="font-serif"
      style={{ fontWeight: 800, fontSize: 23, color, marginTop: 3 }}
    >
      {value}
    </div>
  </div>
);

function Spotlight({
  slug,
  price,
  ppsf,
  dom,
}: {
  slug: string;
  price?: number;
  ppsf?: number;
  dom?: number;
}) {
  const c = bySlug[slug];
  const county = countyById[c.county];
  return (
    <div>
      <div
        className="font-mono"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 10,
          letterSpacing: ".24em",
          color: "#D9481F",
          border: "1px solid rgba(217,72,31,.45)",
          borderRadius: 999,
          padding: "6px 12px",
          marginBottom: 18,
        }}
      >
        {county.name.toUpperCase()} COUNTY
      </div>
      <div
        className="font-serif"
        style={{
          fontWeight: 900,
          fontSize: "clamp(34px,3.4vw,46px)",
          lineHeight: 1,
          letterSpacing: "-.01em",
          color: pal.text,
        }}
      >
        {c.name}
      </div>
      <div
        className="font-serif"
        style={{ fontStyle: "italic", fontSize: 17, color: pal.textSoft, marginTop: 10 }}
      >
        {c.tagline}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 1,
          background: pal.hair,
          border: `1px solid ${pal.hair}`,
          borderRadius: 14,
          overflow: "hidden",
          marginTop: 22,
        }}
      >
        {price ? statCell("MEDIAN LIST", fmtPrice(price), "#D9481F") : null}
        {ppsf ? statCell("$ / SQFT", "$" + Math.round(ppsf), pal.text) : null}
        {statCell("POPULATION", fmtPop(c.pop), pal.text)}
        {dom !== undefined ? statCell("DAYS ON MKT", String(Math.round(dom)), pal.text) : null}
      </div>
      <a
        href={`/city/${c.slug}`}
        className="btn-spot"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          marginTop: 20,
          background: "#D9481F",
          color: "#F6F1E6",
          textDecoration: "none",
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: ".04em",
          padding: "15px 20px",
          borderRadius: 999,
          boxShadow: "0 10px 22px rgba(217,72,31,.25)",
        }}
      >
        Read the {c.name} report →
      </a>
    </div>
  );
}

function CountyPanel({
  id,
  priceOf,
  onClear,
  onCityEnter,
  onCityLeave,
}: {
  id: string;
  priceOf: (slug: string) => number | undefined;
  onClear: () => void;
  onCityEnter: (slug: string) => void;
  onCityLeave: () => void;
}) {
  const co = countyById[id];
  const list = citiesInCounty(id);
  return (
    <div>
      <button
        onClick={onClear}
        className="btn-clear font-mono"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 10.5,
          letterSpacing: ".2em",
          color: pal.textFaint,
          padding: "0 0 14px",
        }}
      >
        ← ALL COUNTIES
      </button>
      <div
        className="font-serif"
        style={{ fontWeight: 900, fontSize: 34, lineHeight: 1, color: pal.text }}
      >
        {co.name}{" "}
        <span
          style={{ fontWeight: 700, fontStyle: "italic", fontSize: 19, color: pal.textSoft }}
        >
          County
        </span>
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: pal.textSoft, margin: "10px 0 16px" }}>
        {co.blurb}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {list.map((c) => (
          <a
            key={c.slug}
            href={`/city/${c.slug}`}
            onMouseEnter={() => onCityEnter(c.slug)}
            onMouseLeave={onCityLeave}
            className="cp-city"
            style={{
              textDecoration: "none",
              border: `1.5px solid ${pal.hair}`,
              borderRadius: 12,
              padding: "10px 12px",
              background: pal.side,
            }}
          >
            <div
              className="font-serif"
              style={{ fontWeight: 800, fontSize: 15, color: pal.text, lineHeight: 1.15 }}
            >
              {c.name}
            </div>
            <div className="font-mono" style={{ fontSize: 10.5, color: "#D9481F", marginTop: 3 }}>
              {(() => {
                const v = priceOf(c.slug);
                return v ? fmtPrice(v) : "—";
              })()}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function CountyList({
  priceOf,
  onEnter,
  onLeave,
  onClick,
}: {
  priceOf: (slug: string) => number | undefined;
  onEnter: (id: string) => void;
  onLeave: () => void;
  onClick: (id: string) => void;
}) {
  return (
    <div>
      <div
        className="font-mono"
        style={{
          fontSize: 10,
          letterSpacing: ".26em",
          color: pal.textFaint,
          marginBottom: 16,
        }}
      >
        THE EIGHT COUNTIES — HOVER TO TINT, CLICK TO OPEN
      </div>
      {counties.map((co, i) => {
        const cs = citiesInCounty(co.id);
        return (
          <div
            key={co.id}
            onMouseEnter={() => onEnter(co.id)}
            onMouseLeave={onLeave}
            onClick={() => onClick(co.id)}
            className="county-row"
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              padding: "11px 10px",
              margin: "0 -10px",
              borderBottom: `1px solid ${pal.hair}`,
              cursor: "pointer",
              borderRadius: 10,
            }}
          >
            <span
              className="font-mono"
              style={{ fontSize: 9.5, color: "#D9481F", fontWeight: 700 }}
            >
              {"0" + (i + 1)}
            </span>
            <span
              className="font-serif"
              style={{ fontWeight: 800, fontSize: 19, color: pal.text }}
            >
              {co.name}
            </span>
            <span
              style={{
                flex: 1,
                borderBottom: `1px dotted ${pal.hair}`,
                transform: "translateY(-4px)",
              }}
            />
            <span className="font-mono" style={{ fontSize: 10.5, color: pal.textSoft }}>
              {cs.length} CITIES
            </span>
            <span
              className="font-mono"
              title="Median of this county's city medians"
              style={{ fontSize: 10.5, color: "#D9481F", fontWeight: 700 }}
            >
              {(() => {
                const vals = cs.map((c) => priceOf(c.slug)).filter((v): v is number => typeof v === "number" && v > 0);
                return vals.length ? fmtPrice(median(vals)) : "";
              })()}
            </span>
          </div>
        );
      })}
      <div
        className="font-mono"
        style={{
          fontSize: 9.5,
          letterSpacing: ".14em",
          color: pal.textFaint,
          marginTop: 16,
          lineHeight: 1.8,
        }}
      >
        ● CITY — CLICK TO OPEN ITS REPORT
        <br />◆ LANDMARK &nbsp;·&nbsp; ⬡ COUNTY &nbsp;·&nbsp; 〜 LAKE &nbsp;·&nbsp; ╌ TOLLWAY
      </div>
    </div>
  );
}
