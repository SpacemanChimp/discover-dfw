import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import {
  cities,
  bySlug,
  countyById,
  counties,
  lakes,
  project,
  pts,
  fmtK,
  City,
} from "@/lib/dfw-data";
import {
  hoodsForCity,
  findHood,
  slugifyHood,
  citiesWithHood,
  canonicalCityForHood,
  contentFor,
  HoodRef,
} from "@/lib/hoods";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { isLiveMls } from "@/lib/mls";
import { getApprovedPhotos, photoKey } from "@/lib/content/editorial-photos";
import { getNewBuildInventory } from "@/lib/content/new-build-stats";
import { PinSvg } from "@/components/Logo";
import CityNav from "@/components/city/CityNav";
import EditorialPhoto from "@/components/EditorialPhoto";
import Reveals from "@/components/Reveals";
import TrecLinks from "@/components/TrecLinks";

export function generateStaticParams() {
  return cities.flatMap((c) =>
    hoodsForCity(c).map((h) => ({ slug: c.slug, hood: h.slug }))
  );
}

function resolve(slug: string, hood: string): { c: City; h: HoodRef } | { redirect: string } | null {
  const c = bySlug[slug] || bySlug[slug.toLowerCase()];
  if (!c) return null;
  // Params usually arrive percent-decoded; a stray malformed sequence must
  // 404, not throw a URIError and 500.
  let decoded = hood;
  try {
    decoded = decodeURIComponent(hood);
  } catch {
    /* keep raw segment */
  }
  const exact = c.slug === slug ? findHood(c, decoded) : undefined;
  if (exact) return { c, h: exact };
  // Wrong case / spacing ("Harvest", "FM 407 Corridor") → 308 to the canonical slug.
  const norm = slugifyHood(decoded);
  const match = findHood(c, norm);
  if (match) return { redirect: `/city/${c.slug}/${match.slug}` };
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; hood: string }>;
}): Promise<Metadata> {
  const { slug, hood } = await params;
  const res = resolve(slug, hood);
  if (!res || "redirect" in res) return { title: SITE_NAME };
  const { c, h } = res;
  const county = countyById[c.county];
  const content = contentFor(c, h);
  const nb = h.newBuild;

  /* CB-3a: Content Desk overrides win when present; the formulas below
     remain the fallback for every page without them (mirrored in
     lib/content/community-content-drafts.ts for duplicate detection —
     change them there too). */
  const title =
    content.seo?.title ??
    (nb
      ? `${h.name} — New Construction Homes in ${c.name}, TX`
      : `${h.name} — ${c.name}, TX Neighborhood Guide & Homes`);
  const description =
    content.seo?.description ??
    (nb
      ? `${h.name} is a new-build community in ${c.name}, TX (${county.name} County) — ${nb.status.toLowerCase()}, priced from the ${nb.from} with ${nb.builders} active builders. Amenities, buyer resources, schools & FAQs.`
      : `${h.name} neighborhood in ${c.name}, TX (${county.name} County): what it's like to live there, homes & real estate character, ${c.isd} schools, commutes, and FAQs.`);
  const canonicalPath = `/city/${canonicalCityForHood(h)}/${h.slug}`;

  return {
    title,
    description,
    keywords: [
      `${h.name} ${c.name} TX`,
      `homes for sale in ${h.name}`,
      `${h.name} ${c.name} real estate`,
      ...(nb
        ? [
            `new construction ${h.name}`,
            `new build homes ${c.name} TX`,
            `${h.name} builders`,
            `new home communities ${county.name} County`,
          ]
        : [`living in ${h.name}`, `${h.name} neighborhood ${c.name}`]),
      `${c.name} neighborhoods`,
      "DFW real estate",
    ],
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: `${h.name} · ${c.name}, TX`,
      description,
      url: canonicalPath,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
    },
    twitter: { card: "summary", title, description },
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export default async function HoodPage({
  params,
}: {
  params: Promise<{ slug: string; hood: string }>;
}) {
  const { slug, hood } = await params;
  const res = resolve(slug, hood);
  if (!res) notFound();
  if ("redirect" in res) permanentRedirect(res.redirect);
  const { c, h } = res;

  const county = countyById[c.county];
  const content = contentFor(c, h);
  const nb = h.newBuild;

  /* CI-3: approved hero photo (photo_assets is human-gated; empty →
     the placeholder below renders unchanged) */
  const photos = await getApprovedPhotos("neighborhood", `${c.slug}/${h.slug}`);

  /* NB inventory band: renders ONLY for published new-build communities
     with a snapshot above the thin-inventory threshold — null (today's
     state for all 19) leaves this page byte-identical */
  const nbInventory = nb ? await getNewBuildInventory(c.slug, h.slug) : null;

  const cityIdx = cities.indexOf(c);
  const prevCity = cities[(cityIdx - 1 + cities.length) % cities.length];
  const nextCity = cities[(cityIdx + 1) % cities.length];
  const roster = hoodsForCity(c);
  const idx = roster.findIndex((x) => x.slug === h.slug);
  const prev = roster[(idx - 1 + roster.length) % roster.length];
  const next = roster[(idx + 1) % roster.length];
  const siblings = roster.filter((x) => x.slug !== h.slug);
  const sharedCities = citiesWithHood(h.name).filter((x) => x.slug !== c.slug);

  const p = project(c.ll);
  const curX = r1(p[0]);
  const curY = r1(p[1]);
  const coords =
    Math.abs(c.ll[1]).toFixed(3) + "° N · " + Math.abs(c.ll[0]).toFixed(3) + "° W";

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
    .filter((x) => x.slug !== c.slug)
    .map((x) => {
      const q = project(x.ll);
      return { x: Math.round(q[0]), y: Math.round(q[1]) };
    });

  // JSON-LD describes THIS page; the <link rel=canonical> (in metadata)
  // handles consolidation for cross-listed communities.
  const pageUrl = `${SITE_URL}/city/${c.slug}/${h.slug}`;

  /* ---- structured data: breadcrumbs + place + FAQ ---- */
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
        { "@type": "ListItem", position: 3, name: h.name, item: pageUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Place",
      name: `${h.name}, ${c.name}, TX`,
      description: content.tagline,
      url: pageUrl,
      geo: { "@type": "GeoCoordinates", latitude: c.ll[1], longitude: c.ll[0] },
      containedInPlace: {
        "@type": "City",
        name: `${c.name}, Texas`,
        url: `${SITE_URL}/city/${c.slug}`,
        containedInPlace: { "@type": "AdministrativeArea", name: `${county.name} County, Texas` },
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: content.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];

  const kicker = nb ? "NEW BUILD COMMUNITY REPORT" : "NEIGHBORHOOD REPORT";

  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CityNav slug={c.slug} options={options} prevSlug={prevCity.slug} nextSlug={nextCity.slug} />

      {/* breadcrumb trail */}
      <nav aria-label="Breadcrumb" style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 4vw 0" }}>
        <ol
          className="font-mono"
          style={{
            listStyle: "none",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            margin: 0,
            padding: 0,
            fontSize: 9.5,
            letterSpacing: ".2em",
            color: "rgba(29,25,19,.55)",
          }}
        >
          <li>
            <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
              DISCOVER DFW
            </Link>
          </li>
          <li aria-hidden="true">→</li>
          <li>
            <Link href={`/city/${c.slug}`} style={{ color: "inherit", textDecoration: "none" }}>
              {c.name.toUpperCase()}
            </Link>
          </li>
          <li aria-hidden="true">→</li>
          <li style={{ color: "#D9481F", fontWeight: 700 }}>{h.name.toUpperCase()}</li>
        </ol>
      </nav>

      {/* Hero */}
      <header
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "46px 4vw 56px",
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
            {c.name.toUpperCase()} · {county.name.toUpperCase()} COUNTY · {kicker}
          </div>
          <h1
            className="font-serif"
            style={{
              margin: "14px 0 0",
              fontWeight: 900,
              fontSize: "clamp(44px,6.4vw,92px)",
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
                {h.name}
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
            {content.tagline}
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
            {nb ? (
              <>
                <HeroStat label="PRICED FROM" value={nb.from} color="#D9481F" />
                <HeroStat label="BUILDERS" value={`${nb.builders} ACTIVE`} />
                <HeroStat label="STATUS" value={nb.status} />
                <HeroStat label="SCHOOLS" value={c.isd} />
              </>
            ) : (
              <>
                <HeroStat label="CITY MEDIAN" value={fmtK(c.price)} color="#D9481F" />
                <HeroStat label="$ / SQFT (CITY)" value={"$" + c.ppsf} />
                <HeroStat label="SCHOOLS" value={c.isd} />
                <HeroStat label="DT DALLAS" value={`${c.commute[0]} MIN`} />
              </>
            )}
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
              role="img"
              aria-label={`Map of the DFW metroplex highlighting ${c.name}, home of ${h.name}`}
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
              <span style={{ color: "#D9481F", fontWeight: 700 }}>
                {h.name.toUpperCase()} · {c.name.toUpperCase()}, TX
              </span>
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
            <SectionH2 style={{ marginBottom: 18 }}>
              What {h.name} feels like.
            </SectionH2>
            {content.intro.map((para, i) => (
              <p
                key={i}
                style={{
                  margin: i === 0 ? 0 : "16px 0 0",
                  fontSize: 17,
                  lineHeight: 1.85,
                  color: "rgba(29,25,19,.82)",
                }}
              >
                {para}
              </p>
            ))}
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
            <QuickFact k="CITY" v={`${c.name}, TX`} />
            <QuickFact k="COUNTY" v={`${county.name} County`} />
            <QuickFact k="SCHOOLS" v={c.isd} right />
            <QuickFact
              k="TYPE"
              v={nb ? "New-build community" : "Established neighborhood"}
            />
            {nb ? (
              <QuickFact k="STATUS" v={nb.status} last />
            ) : (
              <QuickFact k="DT DALLAS" v={`${c.commute[0]} min drive`} last />
            )}
            <div
              className="font-mono"
              style={{ marginTop: 10, fontSize: 9, letterSpacing: ".16em", color: "#D9481F" }}
            >
              PLACEHOLDER FIGURES — VERIFY BEFORE PUBLISHING
            </div>
          </div>
        </div>
      </section>

      {/* 02 · new-build resources OR real-estate character */}
      {nb ? (
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
              <Eyebrow>02 — NEW BUILD RESOURCES</Eyebrow>
              <SectionH2>Buying new in {h.name}.</SectionH2>
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
              PLACEHOLDERS — VERIFY WITH SALES OFFICES
            </span>
          </div>

          <div
            data-reveal="1"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18, marginBottom: 34 }}
          >
            <MarketCard label="PRICED FROM" value={nb.from} sub="BASE PRICING · BY PHASE" valColor="#D9481F" />
            <MarketCard label="ACTIVE BUILDERS" value={String(nb.builders)} sub="MODEL HOMES OPEN" />
            <MarketCard
              label="SALES STATUS"
              value={nb.status}
              sub={
                nb.status === "FINAL PHASE"
                  ? "LAST LOTS REMAINING"
                  : nb.status === "MODELS OPEN"
                  ? "TOUR THE MODELS"
                  : "TAKING CONTRACTS NOW"
              }
            />
          </div>

          {nbInventory && (
            <div
              data-reveal="1"
              className="font-mono"
              style={{
                border: "2px solid #1D1913",
                borderRadius: 14,
                background: "#FBF7EE",
                padding: "16px 22px",
                marginBottom: 34,
                display: "flex",
                gap: 24,
                flexWrap: "wrap",
                alignItems: "baseline",
              }}
            >
              <span style={{ fontSize: 10, letterSpacing: ".22em", fontWeight: 700, color: "#D9481F" }}>
                LIVE NTREIS DATA
              </span>
              <span style={{ fontSize: 12.5, letterSpacing: ".08em" }}>
                <strong>{nbInventory.activeCount}</strong> ACTIVE LISTINGS MATCHED TO THIS COMMUNITY
              </span>
              <span style={{ fontSize: 12.5, letterSpacing: ".08em" }}>
                <strong>{nbInventory.pendingCount}</strong> PENDING
              </span>
              {nbInventory.quickMoveInEst > 0 && (
                <span style={{ fontSize: 12.5, letterSpacing: ".08em" }}>
                  ~<strong>{nbInventory.quickMoveInEst}</strong> QUICK MOVE-IN — ESTIMATE
                </span>
              )}
              <span style={{ fontSize: 9.5, letterSpacing: ".16em", color: "rgba(29,25,19,.55)" }}>
                AS OF{" "}
                {new Date(nbInventory.asOf)
                  .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
                  .toUpperCase()}{" "}
                · MLS-MATCHED ONLY — BUILDER INVENTORY MAY DIFFER
              </span>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(min(400px,90vw),1fr))",
              gap: 48,
              alignItems: "start",
            }}
          >
            <div data-reveal="1">
              <h3
                className="font-serif"
                style={{ margin: "0 0 16px", fontWeight: 800, fontSize: 24 }}
              >
                Community amenities
              </h3>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
                {(content.newBuild?.amenities || [nb.note]).map((a) => (
                  <li
                    key={a}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "baseline",
                      border: "1.5px solid rgba(29,25,19,.3)",
                      borderRadius: 14,
                      background: "#FBF7EE",
                      padding: "13px 17px",
                      fontSize: 15,
                      lineHeight: 1.55,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 99,
                        background: "#D9481F",
                        flexShrink: 0,
                        transform: "translateY(-1px)",
                      }}
                    />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
            <div data-reveal="1">
              <h3
                className="font-serif"
                style={{ margin: "0 0 16px", fontWeight: 800, fontSize: 24 }}
              >
                Buyer&apos;s field notes
              </h3>
              <div style={{ display: "grid", gap: 14 }}>
                {(content.newBuild?.buyerNotes || []).map((note, i) => (
                  <div
                    key={i}
                    style={{
                      border: "2px solid #1D1913",
                      borderRadius: 16,
                      background: "#FBF7EE",
                      padding: "18px 22px",
                    }}
                  >
                    <div
                      className="font-mono"
                      style={{ fontSize: 9.5, letterSpacing: ".22em", color: "#D9481F", fontWeight: 700 }}
                    >
                      N°{i + 1}
                    </div>
                    <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.7, color: "rgba(29,25,19,.8)" }}>
                      {note}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section style={{ maxWidth: 1280, margin: "0 auto", padding: "84px 4vw 72px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(min(420px,90vw),1fr))",
              gap: 48,
              alignItems: "start",
            }}
          >
            <div data-reveal="1">
              <Eyebrow>02 — THE REAL ESTATE</Eyebrow>
              <SectionH2 style={{ marginBottom: 18 }}>What homes look like here.</SectionH2>
              <p style={{ margin: 0, fontSize: 17, lineHeight: 1.85, color: "rgba(29,25,19,.82)" }}>
                {content.homes}
              </p>
              {isLiveMls ? (
                <Link
                  href={`/city/${c.slug}/homes`}
                  className="font-mono"
                  style={{
                    display: "inline-block",
                    marginTop: 18,
                    fontSize: 9,
                    letterSpacing: ".16em",
                    color: "#D9481F",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  SEARCH LIVE {c.name.toUpperCase()} HOMES →
                </Link>
              ) : (
                <div
                  className="font-mono"
                  style={{ marginTop: 18, fontSize: 9, letterSpacing: ".16em", color: "#D9481F" }}
                >
                  MARKET FIGURES ARE PLACEHOLDERS — CONNECT MLS
                </div>
              )}
            </div>
            <div data-reveal="1">
              <EditorialPhoto
                photo={photos.get(photoKey(`${c.slug}/${h.slug}`, "hero"))}
                priority
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
                  {h.name.toUpperCase()} STREETSCAPE
                </span>
              </EditorialPhoto>
            </div>
          </div>
        </section>
      )}

      {/* 03 · highlights */}
      <section style={{ borderTop: "2px solid #1D1913", background: "#F2EBDC" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "84px 4vw" }}>
          <div data-reveal="1" style={{ marginBottom: 30 }}>
            <Eyebrow>{nb ? "03 — WHY BUYERS LOOK HERE" : "03 — WHY PEOPLE LOOK HERE"}</Eyebrow>
            <SectionH2>The case for {h.name}.</SectionH2>
          </div>
          <div
            data-reveal="1"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 18 }}
          >
            {content.highlights.map((hl, i) => (
              <div
                key={hl.title}
                className="hood-card"
                style={{
                  border: "2px solid #1D1913",
                  borderRadius: 18,
                  background: "#FBF7EE",
                  padding: "24px 26px",
                }}
              >
                <div
                  className="font-mono"
                  style={{ fontSize: 9.5, letterSpacing: ".22em", color: "#D9481F", fontWeight: 700 }}
                >
                  N°{i + 1}
                </div>
                <div className="font-serif" style={{ fontWeight: 800, fontSize: 23, marginTop: 10, lineHeight: 1.1 }}>
                  {hl.title}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(29,25,19,.68)", marginTop: 9 }}>
                  {hl.note}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 04 · FAQ */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "84px 4vw" }}>
        <div data-reveal="1" style={{ marginBottom: 30 }}>
          <Eyebrow>04 — GOOD QUESTIONS</Eyebrow>
          <SectionH2>Asked about {h.name}, answered straight.</SectionH2>
        </div>
        <div data-reveal="1" style={{ display: "grid", gap: 0, border: "2px solid #1D1913", borderRadius: 18, background: "#FBF7EE", overflow: "hidden" }}>
          {content.faq.map((f, i) => (
            <div
              key={f.q}
              style={{
                padding: "24px 28px",
                borderBottom: i === content.faq.length - 1 ? undefined : "1px solid rgba(29,25,19,.14)",
              }}
            >
              <h3
                className="font-serif"
                style={{ margin: 0, fontWeight: 800, fontSize: 20, lineHeight: 1.25 }}
              >
                {f.q}
              </h3>
              <p style={{ margin: "10px 0 0", fontSize: 15.5, lineHeight: 1.75, color: "rgba(29,25,19,.75)" }}>
                {f.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 05 · keep exploring */}
      <section style={{ borderTop: "2px solid #1D1913", background: "#1D1913", color: "#F6F1E6" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "84px 4vw" }}>
          <div data-reveal="1" style={{ marginBottom: 34 }}>
            <div
              className="font-mono"
              style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".32em", color: "#E88D6B", marginBottom: 14 }}
            >
              05 — KEEP EXPLORING
            </div>
            <SectionH2 light>More of {c.name} worth a look.</SectionH2>
          </div>
          <div
            data-reveal="1"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 18 }}
          >
            {siblings.map((s) => (
              <Link
                key={s.slug}
                href={`/city/${c.slug}/${s.slug}`}
                className="hood-card"
                style={{
                  border: "2px solid rgba(246,241,230,.35)",
                  borderRadius: 18,
                  background: "rgba(246,241,230,.05)",
                  padding: "22px 24px",
                  textDecoration: "none",
                  color: "#F6F1E6",
                  display: "block",
                }}
              >
                <div
                  className="font-mono"
                  style={{ fontSize: 9, letterSpacing: ".2em", color: "#E88D6B", fontWeight: 700 }}
                >
                  {s.newBuild ? "NEW BUILD COMMUNITY" : "NEIGHBORHOOD"}
                </div>
                <div className="font-serif" style={{ fontWeight: 800, fontSize: 21, marginTop: 9, lineHeight: 1.15 }}>
                  {s.name}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "rgba(246,241,230,.65)", marginTop: 8 }}>
                  {s.note}
                </div>
              </Link>
            ))}
            <Link
              href={`/city/${c.slug}`}
              className="hood-card"
              style={{
                border: "2px solid #E88D6B",
                borderRadius: 18,
                background: "rgba(232,141,107,.1)",
                padding: "22px 24px",
                textDecoration: "none",
                color: "#F6F1E6",
                display: "block",
              }}
            >
              <div
                className="font-mono"
                style={{ fontSize: 9, letterSpacing: ".2em", color: "#E88D6B", fontWeight: 700 }}
              >
                FULL CITY REPORT
              </div>
              <div className="font-serif" style={{ fontWeight: 800, fontSize: 21, marginTop: 9, lineHeight: 1.15 }}>
                {c.name}, TX →
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "rgba(246,241,230,.65)", marginTop: 8 }}>
                Market snapshot, schools, commutes, and every neighborhood.
              </div>
            </Link>
          </div>
          {sharedCities.length > 0 && (
            <p
              data-reveal="1"
              style={{ margin: "26px 0 0", fontSize: 14.5, lineHeight: 1.7, color: "rgba(246,241,230,.7)" }}
            >
              {h.name} spans city lines —{" "}
              {sharedCities.map((sc, i) => (
                <span key={sc.slug}>
                  {i > 0 && " · "}
                  see the{" "}
                  <Link
                    href={`/city/${sc.slug}/${h.slug}`}
                    style={{ color: "#E88D6B", textDecoration: "underline" }}
                  >
                    {sc.name} side of {h.name}
                  </Link>
                </span>
              ))}
              .
            </p>
          )}
        </div>
      </section>

      {/* prev / next hood */}
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
          <Link
            href={`/city/${c.slug}/${prev.slug}`}
            className="prevnext prevnext-left"
            style={{ textDecoration: "none", color: "#1D1913", justifySelf: "start" }}
          >
            <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".24em", color: "rgba(29,25,19,.5)" }}>
              ← PREVIOUS STOP
            </div>
            <div className="font-serif" style={{ fontWeight: 900, fontSize: "clamp(22px,2.6vw,34px)", marginTop: 6 }}>
              {prev.name}
            </div>
          </Link>
          <Link
            href={`/city/${c.slug}`}
            title={`Back to the ${c.name} report`}
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
            href={`/city/${c.slug}/${next.slug}`}
            className="prevnext prevnext-right"
            style={{ textDecoration: "none", color: "#1D1913", justifySelf: "end", textAlign: "right" }}
          >
            <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".24em", color: "rgba(29,25,19,.5)" }}>
              NEXT STOP →
            </div>
            <div className="font-serif" style={{ fontWeight: 900, fontSize: "clamp(22px,2.6vw,34px)", marginTop: 6 }}>
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

/* ---- small presentational helpers (mirrors app/city/[slug]/page.tsx) ---- */
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
