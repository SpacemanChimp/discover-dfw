"use client";
import { useRouter } from "next/navigation";
import { cities, counties, lakes, project, pts, bySlug } from "@/lib/dfw-data";
import type { Listing } from "@/lib/mls/types";
import { useShelf } from "@/lib/shelf";

const r1 = (n: number) => Math.round(n * 10) / 10;

/* The Map Room's right pane: the illustrated metroplex with $-price pins.
   Orange pin = in the viewed city, ink pin = on your shelf, cream = elsewhere.
   Clicking a pin opens the listing; clicking a city dot scopes the search.
   Pins sit on real feed coordinates when a listing carries them (Trestle
   does); mock listings without coordinates stack on the city centroid. */
export default function SearchMapPanel({
  listings,
  activeCitySlug,
  total,
}: {
  listings: Listing[];
  activeCitySlug?: string;
  total: number;
}) {
  const router = useRouter();
  const shelf = useShelf();

  const mapCounties = counties.map((co) => ({
    points: pts(co.poly),
    fill:
      activeCitySlug && bySlug[activeCitySlug]?.county === co.id
        ? "#F5D0B2"
        : co.tone === 2
        ? "#EFE5CF"
        : co.tone === 1
        ? "#F1E9D8"
        : "#F5EEDF",
  }));
  const mapLakes = lakes.map((lk) => ({ points: pts(lk.pts) }));

  const active = activeCitySlug ? bySlug[activeCitySlug] : undefined;
  const activeXY = active ? project(active.ll).map(r1) : null;

  // real coordinates pin exactly; coordinate-less (mock) listings stack
  // vertically on their city centroid, like the prototype
  const seen: Record<string, number> = {};
  const pins = listings.flatMap((l) => {
    const c = bySlug[l.citySlug];
    let x: number, y: number;
    if (l.lonLat) {
      [x, y] = project(l.lonLat);
    } else if (c) {
      const n = seen[l.citySlug] || 0;
      seen[l.citySlug] = n + 1;
      const [cx, cy] = project(c.ll);
      [x, y] = [cx, cy + n * 38];
    } else {
      return [];
    }
    const saved = shelf.ready && shelf.isSaved(l.listingKey);
    const inCity = l.citySlug === activeCitySlug;
    return [{
      key: l.listingKey,
      x: r1(x),
      y: r1(y),
      label: "$" + Math.round(l.listPrice / 1000) + "K",
      bg: inCity ? "#D9481F" : saved ? "#1D1913" : "#FBF7EE",
      fg: inCity || saved ? "#F6F1E6" : "#1D1913",
      ring: inCity ? "#F6F1E6" : "#1D1913",
    }];
  });

  return (
    <div
      style={{
        position: "relative",
        background: "#F2EBDC",
        backgroundImage: "radial-gradient(rgba(38,32,22,.08) 1px, transparent 1px)",
        backgroundSize: "26px 26px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "16px 10px 8px",
      }}
    >
      <div
        className="font-mono"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          padding: "0 14px",
          fontSize: 9.5,
          letterSpacing: ".22em",
          color: "rgba(29,25,19,.62)",
        }}
      >
        <span>DALLAS–FORT WORTH METROPLEX — CLICK A CITY OR A PIN</span>
        <span>N ↑</span>
      </div>
      <svg
        viewBox="30 12 1116 903"
        role="img"
        aria-label="Map of DFW with active listings as price pins"
        style={{ width: "100%", flex: 1, minHeight: 0, display: "block", marginTop: 12 }}
      >
        <g style={{ filter: "drop-shadow(0 12px 20px rgba(20,16,10,.2))" }}>
          {mapCounties.map((co, i) => (
            <polygon
              key={i}
              points={co.points}
              style={{ fill: co.fill, stroke: "#262016", strokeWidth: 1.7, strokeLinejoin: "round" }}
            />
          ))}
        </g>
        {mapLakes.map((lk, i) => (
          <polygon
            key={i}
            points={lk.points}
            style={{ fill: "#A9BFC9", stroke: "#A9BFC9", strokeWidth: 11, strokeLinejoin: "round", opacity: 0.9 }}
          />
        ))}
        {cities.map((c) => {
          const [x, y] = project(c.ll).map(r1);
          return (
            <g
              key={c.slug}
              style={{ cursor: "pointer" }}
              onClick={() => router.push(`/city/${c.slug}/homes`)}
            >
              <title>{`${c.name} — search homes`}</title>
              <circle cx={x} cy={y} r={5} style={{ fill: "rgba(38,32,22,.32)" }} />
              {/* invisible ring widens the tap target — transparent still paints */}
              <circle cx={x} cy={y} r={14} style={{ fill: "transparent" }} />
            </g>
          );
        })}
        {activeXY && (
          <>
            <circle
              cx={activeXY[0]}
              cy={activeXY[1]}
              r={26}
              style={{
                fill: "none",
                stroke: "#D9481F",
                strokeWidth: 2.4,
                transformBox: "fill-box",
                transformOrigin: "center",
                animation: "ringPulse 1.9s cubic-bezier(.2,.8,.4,1) infinite",
              }}
            />
            <circle cx={activeXY[0]} cy={activeXY[1]} r={15} style={{ fill: "rgba(217,72,31,.16)" }} />
          </>
        )}
        {pins.map((p) => (
          <g
            key={p.key}
            transform={`translate(${p.x},${p.y})`}
            style={{ cursor: "pointer" }}
            onClick={() => router.push(`/listing/${p.key}`)}
          >
            <rect x={-36} y={-15} width={72} height={30} rx={15} style={{ fill: p.bg, stroke: p.ring, strokeWidth: 2 }} />
            <text
              textAnchor="middle"
              y={5.5}
              style={{
                fontFamily: "ui-monospace,Menlo,monospace",
                fontSize: 13.5,
                fontWeight: 700,
                fill: p.fg,
              }}
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      <div
        className="font-mono"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: "10px 14px 6px",
          fontSize: 9.5,
          letterSpacing: ".18em",
          color: "rgba(29,25,19,.62)",
        }}
      >
        <span>
          <span style={{ color: "#D9481F", fontWeight: 700 }}>⬤</span> ACTIVE LISTING &nbsp;·&nbsp;{" "}
          <span style={{ fontWeight: 700 }}>⬤</span> ON YOUR SHELF &nbsp;·&nbsp; ◯ CITY
        </span>
        <span>
          {active ? (
            <>
              VIEWING: <span style={{ color: "#C13E17", fontWeight: 700 }}>{active.name.toUpperCase()}</span> ·{" "}
            </>
          ) : null}
          {listings.length} OF {total} RESULTS
        </span>
      </div>
    </div>
  );
}
