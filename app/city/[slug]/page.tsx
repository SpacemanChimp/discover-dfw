import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import {
  cities,
  bySlug,
  countyById,
  hubs,
  counties,
  lakes,
  project,
  pts,
  fmtK,
  City,
} from "@/lib/dfw-data";
import { hoodsForCity } from "@/lib/hoods";
import { getMlsProvider, isLiveMls } from "@/lib/mls";
import type { Listing } from "@/lib/mls/types";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { PinSvg } from "@/components/Logo";
import CityNav from "@/components/city/CityNav";
import Reveals from "@/components/Reveals";
import TrecLinks from "@/components/TrecLinks";

export function generateStaticParams() {
  return cities.map((c) => ({ slug: c.slug }));
}

/* ISR keeps the "On the Market" tier cards fresh against the live feed. */
export const revalidate = 900;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = bySlug[slug];
  if (!c) return { title: SITE_NAME };
  const county = countyById[c.county];
  const topHoods = c.hoods.slice(0, 3).map((h) => h[0]).join(", ");
  const description = `${c.name}, TX in ${county.name} County — ${c.tagline}. Neighborhood guides (${topHoods}), market snapshot, ${c.isd} schools, and commute times.`;
  return {
    title: `${c.name}, TX — Neighborhoods, Homes & Living Guide`,
    description,
    keywords: [
      `${c.name} TX real estate`,
      `homes for sale in ${c.name} TX`,
      `${c.name} neighborhoods`,
      `living in ${c.name} Texas`,
      `${county.name} County homes`,
      "DFW real estate",
    ],
    alternates: { canonical: `/city/${c.slug}` },
    openGraph: {
      title: `${c.name}, TX`,
      description,
      url: `/city/${c.slug}`,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
    },
    twitter: { card: "summary", title: `${c.name}, TX`, description },
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function buildSparkline(c: City) {
  let seed = 0;
  for (let i = 0; i < c.slug.length; i++) seed += c.slug.charCodeAt(i) * (i + 7);
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const yoyF = parseFloat(c.yoy) / 100;
  const start = c.price * (1 - yoyF);
  const vals: number[] = [];
  for (let i = 0; i < 12; i++) {
    const base = start + (c.price - start) * (i / 11);
    vals.push(i === 11 ? c.price : base + (rnd() - 0.5) * c.price * 0.022);
  }
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const px = (i: number) => 10 + (i / 11) * 300;
  const py = (v: number) => 82 - ((v - mn) / (mx - mn || 1)) * 62;
  const spark = vals.map((v, i) => Math.round(px(i)) + "," + r1(py(v))).join(" ");
  return { spark, sparkX: Math.round(px(11)), sparkY: r1(py(vals[11])) };
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = bySlug[slug];
  if (!c) {
    const lower = bySlug[slug.toLowerCase()];
    if (lower) permanentRedirect(`/city/${lower.slug}`);
    notFound();
  }

  const idx = cities.indexOf(c);
  const prev = cities[(idx - 1 + cities.length) % cities.length];
  const next = cities[(idx + 1) % cities.length];
  const county = countyById[c.county];

  const { spark, sparkX, sparkY } = buildSparkline(c);
  const p = project(c.ll);
  const curX = r1(p[0]);
  const curY = r1(p[1]);

  const nameUpper = c.name.toUpperCase();
  const countyUpper = county.name.toUpperCase();

  /* Live market numbers where the store has them; editorial figures stay
     the fallback (and YoY/trend stay editorial estimates — computing real
     YoY needs a year of snapshot history). ⚠ Public market-stat display
     must be verified with the broker/NTREIS before launch is considered
     compliant — noted in the build plan. No sold-data stats are shown. */
  let liveSnap = null;
  if (isLiveMls) {
    try {
      liveSnap = await getMlsProvider().getCityMarketSnapshot(c.slug);
    } catch {
      liveSnap = null; // editorial fallback — a feed hiccup never breaks the page
    }
  }
  const price = fmtK(liveSnap?.medianListPrice ?? c.price);
  const ppsf = "$" + (liveSnap?.pricePerSqft ?? c.ppsf);
  const domDays = liveSnap?.medianDaysOnMarket ?? c.dom;
  const popShort =
    c.pop >= 1000000
      ? (c.pop / 1000000).toFixed(2) + "M"
      : Math.round(c.pop / 1000) + "K";
  const popFull = c.pop.toLocaleString("en-US") + " (placeholder)";
  const coords =
    Math.abs(c.ll[1]).toFixed(3) + "° N · " + Math.abs(c.ll[0]).toFixed(3) + "° W";
  const paceNote = domDays <= 32 ? "MOVES FAST — COME READY" : "ROOM TO NEGOTIATE";

  const hoods = hoodsForCity(c).map((h, i) => ({
    num: "N°" + (i + 1),
    name: h.name,
    note: h.note,
    href: `/city/${c.slug}/${h.slug}`,
    isNewBuild: !!h.newBuild,
  }));
  const gradeBg = (g: string) => (g.indexOf("A") === 0 ? "#1D1913" : "#FBF7EE");
  const gradeFg = (g: string) => (g.indexOf("A") === 0 ? "#F6F1E6" : "#1D1913");
  const schools = c.schools.map((sc) => ({
    name: sc[0],
    level: sc[1].toUpperCase(),
    grade: sc[2],
    bg: gradeBg(sc[2]),
    fg: gradeFg(sc[2]),
  }));
  const commuteRows = hubs.map((h, i) => ({
    hub: h.toUpperCase(),
    min: c.commute[i],
    w: Math.min(100, Math.round((c.commute[i] / 70) * 100)) + "%",
  }));
  const gallery = (
    c.gallery || [c.name + " signature landmark", "neighborhood streetscape", "parks & greenbelt"]
  ).map((t) => t.toUpperCase());

  const factors = [
    { f: 0.86, tag: "MOVE-IN READY", bd: 3, ba: 2 },
    { f: 1.0, tag: "NEW LISTING", bd: 4, ba: 3 },
    { f: 1.26, tag: "THE STRETCH", bd: 5, ba: 4 },
  ];
  const listings = factors.map((x, i) => {
    const pr = Math.round((c.price * x.f) / 5000) * 5000;
    const sq = Math.round(pr / c.ppsf / 10) * 10;
    return {
      tag: x.tag,
      price: "$" + pr.toLocaleString("en-US"),
      meta: `${x.bd} BD · ${x.ba} BA · ${sq.toLocaleString("en-US")} SQFT`,
      hood: c.hoods[Math.min(i, c.hoods.length - 1)][0],
    };
  });

  /* Live tier picks — the entry point, the freshest arrival, the stretch.
     minBeds keeps land parcels out of "move-in ready"; a feed hiccup just
     falls back to the section's empty note, never a broken page. */
  let livePicks: { tag: string; l: Listing }[] = [];
  if (isLiveMls) {
    try {
      const provider = getMlsProvider();
      const base = { citySlug: c.slug, statuses: ["Active" as const], minBeds: 1, pageSize: 12 };
      const [asc, fresh, desc] = await Promise.all([
        provider.searchListings({ ...base, sort: "price-asc" }),
        provider.searchListings({ ...base, sort: "newest" }),
        provider.searchListings({ ...base, sort: "price-desc" }),
      ]);
      const used = new Set<string>();
      const pick = (pool: Listing[]) => {
        const hit =
          pool.find((x) => !used.has(x.listingKey) && x.media[0]?.url) ??
          pool.find((x) => !used.has(x.listingKey));
        if (hit) used.add(hit.listingKey);
        return hit;
      };
      // claim order: entry price, then top of market, then freshest of the
      // rest — so "the stretch" is never outbid by "new listing"
      const entry = pick(asc.listings);
      const stretch = pick(desc.listings);
      const newest = pick(fresh.listings);
      livePicks = (
        [
          ["MOVE-IN READY", entry],
          ["NEW LISTING", newest],
          ["THE STRETCH", stretch],
        ] as const
      ).flatMap(([tag, l]) => (l ? [{ tag, l }] : []));
    } catch {
      livePicks = [];
    }
  }

  const options = cities
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((x) => ({ slug: x.slug, name: x.name }));

  const mapCounties = counties.map((co) => ({
    points: pts(co.poly),
    fill:
      co.id === c.county
        ? "#F5D0B2"
        : co.tone === 2
        ? "#EFE5CF"
        : co.tone === 1
        ? "#F1E9D8"
        : "#F5EEDF",
  }));
  const mapLakes = lakes.map((lk) => ({ points: pts(lk.pts) }));
  const mapDots = cities
    .filter((x) => x.slug !== slug)
    .map((x) => {
      const q = project(x.ll);
      return { x: Math.round(q[0]), y: Math.round(q[1]) };
    });

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Discover DFW", item: SITE_URL },
        {
          "@type": "ListItem",
          position: 2,
          name: `${c.name}, TX`,
          item: `${SITE_URL}/city/${c.slug}`,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Place",
      name: `${c.name}, Texas`,
      description: `${c.tagline}. ${c.vibe}`,
      url: `${SITE_URL}/city/${c.slug}`,
      geo: { "@type": "GeoCoordinates", latitude: c.ll[1], longitude: c.ll[0] },
      containedInPlace: {
        "@type": "AdministrativeArea",
        name: `${county.name} County, Texas`,
      },
      containsPlace: hoods.map((h) => ({
        "@type": "Place",
        name: h.name,
        url: `${SITE_URL}${h.href}`,
      })),
    },
  ];

  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CityNav slug={slug} options={options} prevSlug={prev.slug} nextSlug={next.slug} />

      {/* Hero */}
      <header
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "64px 4vw 56px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(430px,90vw),1fr))",
          gap: 52,
          alignItems: "center",
        }}
      >
        <div>
          <div
            className="font-mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 9,
              fontSize: 10.5,
              letterSpacing: ".24em",
              color: "#D9481F",
              border: "1.5px solid rgba(217,72,31,.5)",
              borderRadius: 999,
              padding: "7px 14px",
              animation: "fadeUp .6s ease both",
            }}
          >
            <span
              style={{ width: 7, height: 7, borderRadius: 99, background: "#D9481F", display: "inline-block" }}
            />
            {countyUpper} COUNTY · CITY REPORT
          </div>
          <h1
            className="font-serif"
            style={{
              margin: "14px 0 0",
              fontWeight: 900,
              fontSize: "clamp(52px,7.6vw,108px)",
              lineHeight: 0.98,
              letterSpacing: "-.015em",
            }}
          >
            <span
              style={{
                display: "inline-block",
                overflow: "hidden",
                verticalAlign: "bottom",
                paddingBottom: ".08em",
                marginBottom: "-.08em",
              }}
            >
              <span
                style={{ display: "inline-block", animation: "riseUp .8s cubic-bezier(.22,1,.36,1) .1s both" }}
              >
                {c.name}
              </span>
            </span>
          </h1>
          <p
            className="font-serif"
            style={{
              margin: "16px 0 0",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "clamp(19px,2.4vw,26px)",
              color: "rgba(29,25,19,.75)",
              animation: "fadeUp .7s ease .3s both",
            }}
          >
            {c.tagline}
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginTop: 28,
              animation: "fadeUp .7s ease .45s both",
            }}
          >
            <HeroStat label="MEDIAN" value={price} color="#D9481F" />
            <HeroStat label="$ / SQFT" value={ppsf} />
            <HeroStat label="DAYS ON MKT" value={String(domDays)} />
            <HeroStat label={liveSnap ? "YOY (EST.)" : "YOY"} value={c.yoy} />
            <HeroStat label="POPULATION" value={popShort} />
          </div>
        </div>

        {/* locator */}
        <div style={{ animation: "fadeUp .8s ease .3s both" }}>
          <div
            style={{
              border: "2px solid #1D1913",
              borderRadius: 20,
              overflow: "hidden",
              background: "#EDE4CF",
              boxShadow: "0 20px 48px rgba(29,25,19,.14)",
            }}
          >
            <div
              className="font-mono"
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px 18px",
                borderBottom: "2px solid #1D1913",
                fontSize: 9.5,
                letterSpacing: ".22em",
                color: "rgba(29,25,19,.55)",
                background: "#F4EDDE",
              }}
            >
              <span>LOCATOR</span>
              <span>N ↑</span>
            </div>
            <svg
              viewBox="30 12 1116 903"
              style={{
                width: "100%",
                display: "block",
                backgroundImage: "radial-gradient(rgba(38,32,22,.06) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            >
              <g style={{ filter: "drop-shadow(0 10px 16px rgba(20,16,10,.18))" }}>
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
              {mapDots.map((d, i) => (
                <circle key={i} cx={d.x} cy={d.y} r={2.6} style={{ fill: "rgba(38,32,22,.3)" }} />
              ))}
              <circle
                cx={curX}
                cy={curY}
                r={22}
                style={{
                  fill: "none",
                  stroke: "#D9481F",
                  strokeWidth: 2.6,
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  animation: "ringPulseCity 1.9s cubic-bezier(.2,.8,.4,1) infinite",
                }}
              />
              <circle cx={curX} cy={curY} r={13} style={{ fill: "rgba(217,72,31,.18)" }} />
              <circle cx={curX} cy={curY} r={7} style={{ fill: "#D9481F", stroke: "#F6F1E6", strokeWidth: 2.4 }} />
            </svg>
            <div
              className="font-mono"
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px 18px",
                borderTop: "2px solid #1D1913",
                fontSize: 9.5,
                letterSpacing: ".18em",
                background: "#F4EDDE",
              }}
            >
              <span style={{ color: "rgba(29,25,19,.55)" }}>{coords}</span>
              <span style={{ color: "#D9481F", fontWeight: 700 }}>{nameUpper}, TX</span>
            </div>
          </div>
        </div>
      </header>

      {/* 01 · vibe */}
      <section style={{ borderTop: "2px solid #1D1913", background: "#F2EBDC" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "72px 4vw",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(420px,90vw),1fr))",
            gap: 48,
            alignItems: "start",
          }}
        >
          <div data-reveal="1">
            <Eyebrow>01 — THE VIBE</Eyebrow>
            <SectionH2 style={{ marginBottom: 18 }}>What it feels like to live here.</SectionH2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.85, color: "rgba(29,25,19,.82)" }}>
              {c.vibe}
            </p>
          </div>
          <div
            data-reveal="1"
            style={{ border: "2px solid #1D1913", borderRadius: 18, background: "#FBF7EE", padding: "26px 28px" }}
          >
            <div
              className="font-mono"
              style={{ fontSize: 10, letterSpacing: ".26em", color: "rgba(29,25,19,.5)", marginBottom: 6 }}
            >
              QUICK FACTS
            </div>
            <QuickFact k="COUNTY" v={`${county.name} County`} />
            <QuickFact k="SCHOOLS" v={c.isd} right />
            <QuickFact k="POPULATION" v={popFull} />
            <QuickFact k="DT DALLAS" v={`${c.commute[0]} min drive`} last />
            <div
              className="font-mono"
              style={{ marginTop: 10, fontSize: 9, letterSpacing: ".16em", color: "#D9481F" }}
            >
              PLACEHOLDER FIGURES — VERIFY BEFORE PUBLISHING
            </div>
          </div>
        </div>
      </section>

      {/* 02 · market */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "84px 4vw 72px" }}>
        <div
          data-reveal="1"
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
            marginBottom: 30,
          }}
        >
          <div>
            <Eyebrow>02 — MARKET SNAPSHOT</Eyebrow>
            <SectionH2>The numbers, at a glance.</SectionH2>
          </div>
          <span
            className="font-mono"
            style={{
              fontSize: 9.5,
              letterSpacing: ".2em",
              color: "#D9481F",
              border: "1px dashed rgba(217,72,31,.6)",
              borderRadius: 999,
              padding: "7px 13px",
              marginBottom: 6,
            }}
          >
            {liveSnap
              ? "LIVE NTREIS DATA · YOY & TREND ARE EDITORIAL ESTIMATES"
              : "PLACEHOLDER DATA — SWAP FOR MLS FEED"}
          </span>
        </div>
        <div
          data-reveal="1"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18 }}
        >
          <MarketCard label="MEDIAN LIST PRICE" value={price} sub={`${c.yoy} YEAR OVER YEAR (EST.)`} valColor="#D9481F" />
          <MarketCard label="PRICE PER SQFT" value={ppsf} sub="METRO AVG ≈ $210" />
          <MarketCard label="DAYS ON MARKET" value={String(domDays)} sub={paceNote} />
          <div
            style={{
              border: "2px solid #1D1913",
              borderRadius: 18,
              background: "#1D1913",
              color: "#F6F1E6",
              padding: "22px 24px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span
                className="font-mono"
                style={{ fontSize: 9.5, letterSpacing: ".2em", color: "rgba(246,241,230,.6)" }}
              >
                12-MO TREND{liveSnap ? " (EST.)" : ""}
              </span>
              <span className="font-mono" style={{ fontSize: 10.5, color: "#E88D6B", fontWeight: 700 }}>
                {c.yoy}
              </span>
            </div>
            <svg viewBox="0 0 320 92" style={{ width: "100%", display: "block", marginTop: 12 }}>
              <line x1="10" y1="78" x2="310" y2="78" style={{ stroke: "rgba(246,241,230,.2)", strokeWidth: 1 }} />
              <line
                x1="10"
                y1="44"
                x2="310"
                y2="44"
                style={{ stroke: "rgba(246,241,230,.1)", strokeWidth: 1, strokeDasharray: "3 4" }}
              />
              <polyline
                points={spark}
                style={{
                  fill: "none",
                  stroke: "#E8865F",
                  strokeWidth: 2.6,
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                  strokeDasharray: 600,
                  animation: "drawIn 1.6s ease-out both",
                }}
              />
              <circle cx={sparkX} cy={sparkY} r={4.4} style={{ fill: "#D9481F", stroke: "#F6F1E6", strokeWidth: 2 }} />
            </svg>
            <div
              className="font-mono"
              style={{ fontSize: 9, letterSpacing: ".16em", color: "rgba(246,241,230,.5)", marginTop: 8 }}
            >
              ILLUSTRATIVE CURVE · PLACEHOLDER
            </div>
          </div>
        </div>
      </section>

      {/* 03 · neighborhoods */}
      <section style={{ borderTop: "2px solid #1D1913", background: "#F2EBDC" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "84px 4vw" }}>
          <div data-reveal="1" style={{ marginBottom: 30 }}>
            <Eyebrow>03 — NEIGHBORHOODS</Eyebrow>
            <SectionH2>Where locals tell you to look.</SectionH2>
          </div>
          <div
            data-reveal="1"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 18 }}
          >
            {hoods.map((h) => (
              <Link
                key={h.name}
                href={h.href}
                className="hood-card"
                style={{
                  border: "2px solid #1D1913",
                  borderRadius: 18,
                  background: "#FBF7EE",
                  padding: "24px 26px",
                  textDecoration: "none",
                  color: "#1D1913",
                  display: "block",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 10,
                  }}
                >
                  <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".22em", color: "#D9481F", fontWeight: 700 }}>
                    {h.num}
                  </span>
                  {h.isNewBuild && (
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 8.5,
                        letterSpacing: ".18em",
                        background: "#D9481F",
                        color: "#F6F1E6",
                        padding: "4px 9px",
                        borderRadius: 999,
                      }}
                    >
                      NEW BUILD
                    </span>
                  )}
                </div>
                <div className="font-serif" style={{ fontWeight: 800, fontSize: 23, marginTop: 10, lineHeight: 1.1 }}>
                  {h.name}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(29,25,19,.68)", marginTop: 9 }}>
                  {h.note}
                </div>
                <div
                  className="font-mono"
                  style={{ fontSize: 9.5, letterSpacing: ".2em", color: "#D9481F", fontWeight: 700, marginTop: 14 }}
                >
                  READ THE REPORT →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 04 · schools */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "84px 4vw" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(400px,90vw),1fr))",
            gap: 48,
            alignItems: "start",
          }}
        >
          <div data-reveal="1">
            <Eyebrow>04 — SCHOOLS</Eyebrow>
            <SectionH2 style={{ marginBottom: 16 }}>Zoned to {c.isd}.</SectionH2>
            <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.75, color: "rgba(29,25,19,.7)" }}>
              Boundary lines shift and ratings age fast — treat these as a
              starting point and verify the exact address with the district
              before you write an offer.
            </p>
            <div className="font-mono" style={{ marginTop: 16, fontSize: 9, letterSpacing: ".16em", color: "#D9481F" }}>
              RATINGS ARE PLACEHOLDERS
            </div>
          </div>
          <div
            data-reveal="1"
            style={{ border: "2px solid #1D1913", borderRadius: 18, background: "#FBF7EE", overflow: "hidden" }}
          >
            {schools.map((s) => (
              <div
                key={s.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "17px 22px",
                  borderBottom: "1px solid rgba(29,25,19,.14)",
                }}
              >
                <span
                  className="font-serif"
                  style={{
                    width: 44,
                    height: 44,
                    border: "2px solid #1D1913",
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: 16,
                    background: s.bg,
                    color: s.fg,
                    flexShrink: 0,
                  }}
                >
                  {s.grade}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="font-serif" style={{ display: "block", fontWeight: 700, fontSize: 17, lineHeight: 1.2 }}>
                    {s.name}
                  </span>
                </span>
                <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".18em", color: "rgba(29,25,19,.55)" }}>
                  {s.level}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 05 · commutes */}
      <section style={{ borderTop: "2px solid #1D1913", background: "#1D1913", color: "#F6F1E6" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "84px 4vw" }}>
          <div data-reveal="1" style={{ marginBottom: 34 }}>
            <div
              className="font-mono"
              style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".32em", color: "#E88D6B", marginBottom: 14 }}
            >
              05 — GETTING AROUND
            </div>
            <SectionH2 light>Drive times that shape your week.</SectionH2>
          </div>
          <div data-reveal="1" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {commuteRows.map((cm) => (
              <div
                key={cm.hub}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(150px,220px) 1fr 84px",
                  gap: 18,
                  alignItems: "center",
                  padding: "15px 0",
                  borderBottom: "1px solid rgba(246,241,230,.16)",
                }}
              >
                <span className="font-mono" style={{ fontSize: 10.5, letterSpacing: ".16em", color: "rgba(246,241,230,.7)" }}>
                  {cm.hub}
                </span>
                <span
                  style={{
                    height: 12,
                    borderRadius: 99,
                    background: "rgba(246,241,230,.1)",
                    overflow: "hidden",
                    display: "block",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      height: "100%",
                      width: cm.w,
                      background: "linear-gradient(90deg,#E8865F,#D9481F)",
                      borderRadius: 99,
                    }}
                  />
                </span>
                <span className="font-serif" style={{ fontWeight: 800, fontSize: 22, textAlign: "right" }}>
                  {cm.min}
                  <span className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", color: "rgba(246,241,230,.55)" }}>
                    {" "}
                    MIN
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div
            data-reveal="1"
            className="font-mono"
            style={{ marginTop: 18, fontSize: 9.5, letterSpacing: ".18em", color: "rgba(246,241,230,.45)" }}
          >
            OFF-PEAK ESTIMATES · PLACEHOLDER — ADD LIVE DRIVE-TIME DATA
          </div>
        </div>
      </section>

      {/* 06 · gallery */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "84px 4vw 72px" }}>
        <div data-reveal="1" style={{ marginBottom: 30 }}>
          <Eyebrow>06 — THE LOOK</Eyebrow>
          <SectionH2>Three frames of {c.name}.</SectionH2>
        </div>
        <div
          data-reveal="1"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }}
        >
          {gallery.map((g) => (
            <div
              key={g}
              className="gallery-slot"
              style={{
                aspectRatio: "4 / 3",
                border: "2px solid #1D1913",
                borderRadius: 18,
                background: "repeating-linear-gradient(-45deg,#EFE7D6 0 12px,#E7DDC7 12px 24px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 18,
              }}
            >
              <span
                className="font-mono"
                style={{
                  fontSize: 10,
                  letterSpacing: ".16em",
                  color: "rgba(29,25,19,.6)",
                  background: "rgba(246,241,230,.9)",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px dashed rgba(29,25,19,.4)",
                  textAlign: "center",
                  lineHeight: 1.7,
                }}
              >
                DROP PHOTO —<br />
                {g}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 07 · listings */}
      <section style={{ borderTop: "2px solid #1D1913", background: "#F2EBDC" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "84px 4vw" }}>
          <div
            data-reveal="1"
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 20,
              flexWrap: "wrap",
              marginBottom: 30,
            }}
          >
            <div>
              <Eyebrow>07 — ON THE MARKET</Eyebrow>
              <SectionH2>Three ways to buy {c.name}.</SectionH2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
              <span
                className="font-mono"
                style={{
                  fontSize: 9.5,
                  letterSpacing: ".2em",
                  color: "#D9481F",
                  border: isLiveMls ? "1px solid rgba(217,72,31,.6)" : "1px dashed rgba(217,72,31,.6)",
                  borderRadius: 999,
                  padding: "7px 13px",
                }}
              >
                {isLiveMls ? "LIVE FROM THE NTREIS FEED" : "PLACEHOLDER LISTINGS — CONNECT MLS"}
              </span>
              <Link
                href={`/city/${c.slug}/homes`}
                className="btn-primary font-mono"
                style={{
                  background: "#D9481F",
                  color: "#F6F1E6",
                  borderRadius: 999,
                  padding: "10px 18px",
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: ".14em",
                  textDecoration: "none",
                  border: "2px solid #D9481F",
                }}
              >
                SEARCH {c.name.toUpperCase()} HOMES →
              </Link>
            </div>
          </div>
          {isLiveMls && livePicks.length === 0 ? (
            <div
              data-reveal="1"
              style={{
                border: "2px dashed rgba(29,25,19,.35)",
                borderRadius: 18,
                padding: "44px 24px",
                textAlign: "center",
              }}
            >
              <div className="font-serif" style={{ fontStyle: "italic", fontWeight: 600, fontSize: 20, color: "rgba(29,25,19,.7)" }}>
                A quiet week on the {c.name} market.
              </div>
              <p style={{ margin: "8px auto 0", maxWidth: 420, fontSize: 14, lineHeight: 1.6, color: "rgba(29,25,19,.6)" }}>
                Nothing active in the feed right this minute — new listings land daily, and the
                search page watches the whole county.
              </p>
            </div>
          ) : (
            <div
              data-reveal="1"
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 18 }}
            >
              {livePicks.length > 0
                ? livePicks.map(({ tag, l }) => (
                    <Link
                      key={tag}
                      href={`/listing/${l.listingKey}`}
                      className="listing-card"
                      style={{
                        border: "2px solid #1D1913",
                        borderRadius: 18,
                        background: "#FBF7EE",
                        overflow: "hidden",
                        textDecoration: "none",
                        color: "#1D1913",
                        display: "block",
                      }}
                    >
                      <div
                        style={{
                          aspectRatio: "4 / 2.6",
                          position: "relative",
                          background: "repeating-linear-gradient(-45deg,#EFE7D6 0 12px,#E7DDC7 12px 24px)",
                          borderBottom: "2px solid #1D1913",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {l.media[0]?.url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={l.media[0].url}
                            alt={`${l.unparsedAddress}, ${c.name}`}
                            loading="lazy"
                            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        )}
                        <span
                          className="font-mono"
                          style={{
                            position: "absolute",
                            top: 12,
                            left: 12,
                            fontSize: 9,
                            letterSpacing: ".2em",
                            background: "#D9481F",
                            color: "#F6F1E6",
                            padding: "5px 10px",
                            borderRadius: 999,
                          }}
                        >
                          {tag}
                        </span>
                      </div>
                      <div style={{ padding: "18px 22px 22px" }}>
                        <div className="font-serif" style={{ fontWeight: 900, fontSize: 27 }}>
                          ${l.listPrice.toLocaleString("en-US")}
                        </div>
                        <div
                          className="font-mono"
                          style={{ fontSize: 10.5, letterSpacing: ".1em", color: "rgba(29,25,19,.6)", marginTop: 6 }}
                        >
                          {l.bedsTotal} BD · {l.bathsTotal} BA · {l.livingAreaSqft.toLocaleString("en-US")} SQFT
                        </div>
                        <div
                          style={{
                            fontSize: 13.5,
                            color: "rgba(29,25,19,.7)",
                            marginTop: 9,
                            borderTop: "1px solid rgba(29,25,19,.14)",
                            paddingTop: 10,
                          }}
                        >
                          {l.unparsedAddress} · {l.neighborhood} · {c.name}, TX
                        </div>
                        {l.attributionText && (
                          <div
                            className="font-mono"
                            style={{ fontSize: 8.5, letterSpacing: ".12em", color: "rgba(29,25,19,.45)", marginTop: 8 }}
                          >
                            {l.attributionText.toUpperCase()} · MLS# {l.listingId}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))
                : listings.map((li) => (
                    <div
                      key={li.tag}
                      className="listing-card"
                      style={{
                        border: "2px solid #1D1913",
                        borderRadius: 18,
                        background: "#FBF7EE",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          aspectRatio: "4 / 2.6",
                          position: "relative",
                          background: "repeating-linear-gradient(-45deg,#EFE7D6 0 12px,#E7DDC7 12px 24px)",
                          borderBottom: "2px solid #1D1913",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span
                          className="font-mono"
                          style={{
                            position: "absolute",
                            top: 12,
                            left: 12,
                            fontSize: 9,
                            letterSpacing: ".2em",
                            background: "#D9481F",
                            color: "#F6F1E6",
                            padding: "5px 10px",
                            borderRadius: 999,
                          }}
                        >
                          {li.tag}
                        </span>
                        <span
                          className="font-mono"
                          style={{
                            fontSize: 9.5,
                            letterSpacing: ".14em",
                            color: "rgba(29,25,19,.55)",
                            background: "rgba(246,241,230,.9)",
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "1px dashed rgba(29,25,19,.4)",
                          }}
                        >
                          LISTING PHOTO
                        </span>
                      </div>
                      <div style={{ padding: "18px 22px 22px" }}>
                        <div className="font-serif" style={{ fontWeight: 900, fontSize: 27 }}>
                          {li.price}
                        </div>
                        <div
                          className="font-mono"
                          style={{ fontSize: 10.5, letterSpacing: ".1em", color: "rgba(29,25,19,.6)", marginTop: 6 }}
                        >
                          {li.meta}
                        </div>
                        <div
                          style={{
                            fontSize: 13.5,
                            color: "rgba(29,25,19,.7)",
                            marginTop: 9,
                            borderTop: "1px solid rgba(29,25,19,.14)",
                            paddingTop: 10,
                          }}
                        >
                          {li.hood} · {c.name}, TX
                        </div>
                      </div>
                    </div>
                  ))}
            </div>
          )}
        </div>
      </section>

      {/* prev / next */}
      <section style={{ borderTop: "2px solid #1D1913" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "64px 4vw",
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: 24,
            alignItems: "center",
          }}
        >
          <Link href={`/city/${prev.slug}`} className="prevnext prevnext-left" style={{ textDecoration: "none", color: "#1D1913", justifySelf: "start" }}>
            <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".24em", color: "rgba(29,25,19,.5)" }}>
              ← PREVIOUS STOP
            </div>
            <div className="font-serif" style={{ fontWeight: 900, fontSize: "clamp(24px,3vw,38px)", marginTop: 6 }}>
              {prev.name}
            </div>
          </Link>
          <Link
            href="/#map"
            title="Back to the map"
            className="pin-btn"
            style={{
              width: 62,
              height: 62,
              borderRadius: 999,
              border: "2px solid #1D1913",
              background: "#D9481F",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              boxShadow: "0 12px 26px rgba(217,72,31,.3)",
            }}
          >
            <PinSvg style={{ height: 30, width: "auto" }} fill="#F6F1E6" holeFill="#D9481F" />
          </Link>
          <Link
            href={`/city/${next.slug}`}
            className="prevnext prevnext-right"
            style={{ textDecoration: "none", color: "#1D1913", justifySelf: "end", textAlign: "right" }}
          >
            <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".24em", color: "rgba(29,25,19,.5)" }}>
              NEXT STOP →
            </div>
            <div className="font-serif" style={{ fontWeight: 900, fontSize: "clamp(24px,3vw,38px)", marginTop: 6 }}>
              {next.name}
            </div>
          </Link>
        </div>
      </section>

      {/* footer */}
      <footer style={{ background: "#1D1913", color: "#F6F1E6" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "26px 4vw 0",
          }}
        >
          <TrecLinks />
        </div>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "26px 4vw",
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Link
            href="/"
            className="font-serif"
            style={{
              textDecoration: "none",
              color: "#F6F1E6",
              fontWeight: 900,
              fontSize: 17,
              display: "inline-flex",
              alignItems: "baseline",
            }}
          >
            DISC
            <PinSvg style={{ height: ".72em", width: "auto", transform: "translateY(.05em)", margin: "0 1px" }} holeFill="#1D1913" />
            VER&nbsp;DFW
          </Link>
          <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".18em", color: "rgba(246,241,230,.5)" }}>
            © MMXXVI · {isLiveMls ? "LISTINGS LIVE FROM NTREIS" : "ALL FIGURES ARE PLACEHOLDERS"}
          </span>
          <Link href="/#map" className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".18em", color: "#E88D6B", textDecoration: "none" }}>
            OPEN THE MAP ↗
          </Link>
        </div>
      </footer>

      <Reveals />
    </div>
  );
}

/* ---- small presentational helpers ---- */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-mono"
      style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".32em", color: "#D9481F", marginBottom: 14 }}
    >
      {children}
    </div>
  );
}

function SectionH2({
  children,
  style,
  light,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  light?: boolean;
}) {
  return (
    <h2
      className="font-serif"
      style={{
        margin: 0,
        fontWeight: 800,
        fontSize: "clamp(30px,3.6vw,44px)",
        lineHeight: 1.05,
        color: light ? "#F6F1E6" : undefined,
        ...style,
      }}
    >
      {children}
    </h2>
  );
}

function HeroStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ border: "1.5px solid rgba(29,25,19,.35)", borderRadius: 14, padding: "11px 16px", background: "#FBF7EE" }}>
      <div className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".2em", color: "rgba(29,25,19,.5)" }}>
        {label}
      </div>
      <div className="font-serif" style={{ fontWeight: 800, fontSize: 22, color: color || "#1D1913", marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function QuickFact({ k, v, right, last }: { k: string; v: string; right?: boolean; last?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 14,
        alignItems: "baseline",
        padding: "13px 0",
        borderBottom: last ? undefined : "1px solid rgba(29,25,19,.16)",
      }}
    >
      <span className="font-mono" style={{ fontSize: 10, letterSpacing: ".18em", color: "rgba(29,25,19,.55)" }}>
        {k}
      </span>
      <span className="font-serif" style={{ fontWeight: 700, fontSize: 17, textAlign: right ? "right" : undefined }}>
        {v}
      </span>
    </div>
  );
}

function MarketCard({
  label,
  value,
  sub,
  valColor,
}: {
  label: string;
  value: string;
  sub: string;
  valColor?: string;
}) {
  return (
    <div style={{ border: "2px solid #1D1913", borderRadius: 18, background: "#FBF7EE", padding: "22px 24px" }}>
      <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".2em", color: "rgba(29,25,19,.5)" }}>
        {label}
      </div>
      <div className="font-serif" style={{ fontWeight: 900, fontSize: 40, color: valColor || "#1D1913", marginTop: 8 }}>
        {value}
      </div>
      <div className="font-mono" style={{ fontSize: 10.5, color: "rgba(29,25,19,.6)", marginTop: 6 }}>
        {sub}
      </div>
    </div>
  );
}
