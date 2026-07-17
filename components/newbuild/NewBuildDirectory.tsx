"use client";
import { useMemo, useState } from "react";
import { newBuilds, bySlug, counties } from "@/lib/dfw-data";
import NewBuildCard from "./NewBuildCard";

/* The full editorial community directory for /new-builds — every current
   new-build community, with the same county filter chips and cards as the
   homepage used to carry. Dark band (matches the card design). Anchored at
   #directory so the homepage "Browse All Communities" link deep-links here.
   Purely editorial: no MLS data, no prices changed. */
export default function NewBuildDirectory() {
  const [filter, setFilter] = useState<string>("all");

  const presentCounties = useMemo(() => {
    const ids = new Set(newBuilds.map((b) => bySlug[b.city].county));
    return counties.filter((c) => ids.has(c.id));
  }, []);

  const shown = useMemo(
    () => (filter === "all" ? newBuilds : newBuilds.filter((b) => bySlug[b.city].county === filter)),
    [filter]
  );

  const chip = (id: string, label: string) => {
    const active = filter === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setFilter(id)}
        aria-pressed={active}
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
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <section id="directory" aria-labelledby="nb-directory-head" style={{ background: "#1D1913", color: "#F6F1E6", borderTop: "2px solid #1D1913" }}>
      <div style={{ maxWidth: 1380, margin: "0 auto", padding: "clamp(48px,6vw,80px) 4vw" }}>
        <div className="font-mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".32em", color: "#E88D6B", marginBottom: 14 }}>
          THE COMMUNITY DIRECTORY
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginBottom: 26 }}>
          <h2 id="nb-directory-head" className="font-serif" style={{ margin: 0, fontWeight: 900, fontSize: "clamp(28px,3.6vw,46px)", lineHeight: 1.04, color: "#F6F1E6" }}>
            Master-planned communities, county by county
          </h2>
          <p style={{ margin: "0 0 6px", maxWidth: 380, fontSize: 15, lineHeight: 1.6, color: "rgba(246,241,230,.7)" }}>
            {newBuilds.length} communities taking contracts across North Texas. Filter by county, then step into the community report. From-prices and builder counts are editorial — verify current numbers with the sales office.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
          {chip("all", `ALL · ${newBuilds.length}`)}
          {presentCounties.map((co) =>
            chip(co.id, `${co.name.toUpperCase()} · ${newBuilds.filter((b) => bySlug[b.city].county === co.id).length}`)
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 18 }}>
          {shown.map((b) => (
            <NewBuildCard key={b.name} b={b} />
          ))}
        </div>
      </div>
    </section>
  );
}
