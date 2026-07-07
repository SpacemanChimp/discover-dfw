"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { newBuilds, bySlug, countyById, counties } from "@/lib/dfw-data";
import { slugifyHood } from "@/lib/slug";

const STATUS_COLOR: Record<string, string> = {
  "NOW SELLING": "#D9481F",
  "MODELS OPEN": "#6FA8B8",
  "FINAL PHASE": "#C9A24B",
};

export default function NewBuilds({ liveMls }: { liveMls?: boolean }) {
  const [filter, setFilter] = useState<string>("all");

  // county ids that actually have communities, in the core-first county order
  const presentCounties = useMemo(() => {
    const ids = new Set(newBuilds.map((b) => bySlug[b.city].county));
    return counties.filter((c) => ids.has(c.id));
  }, []);

  const shown = useMemo(
    () =>
      filter === "all"
        ? newBuilds
        : newBuilds.filter((b) => bySlug[b.city].county === filter),
    [filter]
  );

  const chip = (id: string, label: string) => {
    const active = filter === id;
    return (
      <button
        key={id}
        onClick={() => setFilter(id)}
        className="nb-chip font-mono"
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: ".16em",
          padding: "9px 15px",
          borderRadius: 999,
          border: `1.5px solid ${active ? "#D9481F" : "rgba(246,241,230,.28)"}`,
          background: active ? "#D9481F" : "transparent",
          color: active ? "#F6F1E6" : "rgba(246,241,230,.72)",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <section
      id="new-builds"
      style={{ background: "#1D1913", color: "#F6F1E6", borderTop: "2px solid #1D1913" }}
    >
      <div style={{ maxWidth: 1380, margin: "0 auto", padding: "88px 4vw" }}>
        <div
          data-reveal="1"
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
            marginBottom: 26,
          }}
        >
          <div>
            <div
              className="font-mono"
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".32em",
                color: "#E88D6B",
                marginBottom: 14,
              }}
            >
              NEW CONSTRUCTION — ACTIVELY SELLING
            </div>
            <h2
              className="font-serif"
              style={{
                margin: 0,
                fontWeight: 900,
                fontSize: "clamp(34px,4.4vw,58px)",
                lineHeight: 1.02,
                color: "#F6F1E6",
              }}
            >
              Fresh dirt, first owners.
            </h2>
          </div>
          <p
            style={{
              margin: "0 0 6px",
              maxWidth: 360,
              fontSize: 15,
              lineHeight: 1.6,
              color: "rgba(246,241,230,.7)",
            }}
          >
            Master-planned communities taking contracts right now — filter by
            county, then step into the community report. Prices &amp; builder
            counts are {liveMls ? "editorial — verify with sales offices" : "placeholders"}.
          </p>
        </div>

        <div
          data-reveal="1"
          style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 }}
        >
          {chip("all", `ALL · ${newBuilds.length}`)}
          {presentCounties.map((co) =>
            chip(
              co.id,
              `${co.name.toUpperCase()} · ${
                newBuilds.filter((b) => bySlug[b.city].county === co.id).length
              }`
            )
          )}
        </div>

        <div
          data-reveal="1"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))",
            gap: 18,
          }}
        >
          {shown.map((b) => {
            const city = bySlug[b.city];
            const county = countyById[city.county];
            const sc = STATUS_COLOR[b.status] || "#D9481F";
            return (
              <Link
                key={b.name}
                href={`/city/${b.city}/${slugifyHood(b.name)}`}
                className="nb-card"
                style={{
                  textDecoration: "none",
                  color: "#F6F1E6",
                  border: "2px solid rgba(246,241,230,.18)",
                  borderRadius: 18,
                  background: "#241D12",
                  padding: "22px 24px 24px",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 16,
                  }}
                >
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 9,
                      letterSpacing: ".18em",
                      fontWeight: 700,
                      color: "#1D1913",
                      background: sc,
                      padding: "5px 10px",
                      borderRadius: 999,
                    }}
                  >
                    {b.status}
                  </span>
                  <span
                    className="font-mono"
                    style={{ fontSize: 9.5, letterSpacing: ".16em", color: "rgba(246,241,230,.5)" }}
                  >
                    {county.name.toUpperCase()} CO.
                  </span>
                </div>
                <div
                  className="font-serif"
                  style={{ fontWeight: 900, fontSize: 25, lineHeight: 1.05 }}
                >
                  {b.name}
                </div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: 10.5,
                    letterSpacing: ".1em",
                    color: "#E88D6B",
                    marginTop: 6,
                  }}
                >
                  {city.name}, TX
                </div>
                <p
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    color: "rgba(246,241,230,.72)",
                    margin: "14px 0 18px",
                    flex: 1,
                  }}
                >
                  {b.note}
                </p>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    borderTop: "1px solid rgba(246,241,230,.16)",
                    paddingTop: 14,
                  }}
                >
                  <span>
                    <span
                      className="font-mono"
                      style={{ fontSize: 8.5, letterSpacing: ".2em", color: "rgba(246,241,230,.5)" }}
                    >
                      FROM
                    </span>
                    <span
                      className="font-serif"
                      style={{ fontWeight: 800, fontSize: 22, color: "#F6F1E6", marginLeft: 8 }}
                    >
                      {b.from}
                    </span>
                  </span>
                  <span
                    className="font-mono"
                    style={{ fontSize: 10.5, color: "rgba(246,241,230,.6)" }}
                  >
                    {b.builders} BUILDERS
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
