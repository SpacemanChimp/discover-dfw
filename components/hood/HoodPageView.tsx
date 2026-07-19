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
  HoodContent,
} from "@/lib/hoods";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { nearbySchoolsFor, NEARBY_SCHOOLS_META } from "@/lib/content/nearby-schools";
import { isLiveMls } from "@/lib/mls";
import { getApprovedPhotos, photoKey } from "@/lib/content/editorial-photos";
import { getNewBuildInventory } from "@/lib/content/new-build-stats";
import { PinSvg } from "@/components/Logo";
import CityNav from "@/components/city/CityNav";
import EditorialPhoto from "@/components/EditorialPhoto";
import Reveals from "@/components/Reveals";
import TrecLinks from "@/components/TrecLinks";
import ConvertSlot from "@/components/convert/ConvertSlot";
import ConversionDuo from "@/components/convert/ConversionDuo";
import NewBuildCTA, { type CtaBandButton } from "@/components/convert/NewBuildCTA";
import { leadBackendReady } from "@/lib/convert/config";
import { INTENTS, type IntentKey } from "@/lib/convert/intents";
import { getEditorState, type EditorState } from "@/lib/editor/overrides";
import type { ResolvedRegion } from "@/lib/editor/doc";
import { isBuilderMode } from "@/lib/editor/builder-mode";
import { applyLayout } from "@/lib/editor/blocks-render";
import { TEMPLATE_SECTIONS, hoodCtaFromLayout, hoodGalleryFromLayout, type LayoutDoc } from "@/lib/editor/blocks.ts";
import { RichDoc, textValue, faqItems, bulletTexts } from "@/lib/editor/render";
import PreviewBanner from "@/components/editor/PreviewBanner";

const r1 = (n: number) => Math.round(n * 10) / 10;

/** translate a CTA-override button (label + "intent:<key>"-or-path action)
    into the band/duo props; no override at all keeps the code default */
function ctaButton(
  ovLabel: string | undefined,
  ovAction: string | undefined,
  fallback: { label: string; intent: IntentKey }
): CtaBandButton {
  const a = ovAction ?? "";
  if (a.startsWith("intent:")) {
    const intent = a.slice(7) as IntentKey;
    return { label: ovLabel || INTENTS[intent].cta, intent };
  }
  if (a) return { label: ovLabel || fallback.label, href: a };
  return { label: ovLabel || fallback.label, intent: fallback.intent };
}

/** The COMPLETE hood/community page for (c, h) — extracted so the Community
    Studio can render the REAL template as a private, admin-only preview of
    a not-yet-exported draft. `draft` supplies the content source and skips
    the route's override store read; its `regions` carry the DRAFTED editor
    documents keyed to the future route (layout + region overrides), and
    `builder` mounts the Visual Builder canvas markers so the draft page is
    arrangeable exactly like a live one. Everything else — schools, drive
    times, market data, photos, compliance — renders exactly as the public
    page does. */
export async function HoodPageView({
  c,
  h,
  draft,
}: {
  c: City;
  h: HoodRef;
  draft?: { content: HoodContent; regions?: Record<string, ResolvedRegion>; builder?: boolean };
}) {
  const county = countyById[c.county];
  const content = draft?.content ?? contentFor(c, h);
  const nb = h.newBuild;

  /* EDITOR-desk published overrides (drafts too, but only inside the
     admin-authenticated preview). Every region falls back to the existing
     content when no override exists — and to exactly that same content if
     the override store is unreachable. */
  const ed: EditorState = draft ? { preview: false, regions: draft.regions ?? {} } : await getEditorState(`/city/${c.slug}/${h.slug}`);
  // shared-template layout (Visual Builder) — null = code-owned order
  const tpl = await getEditorState("template:hood");
  const tplLayout = (tpl.regions["__layout"]?.json as LayoutDoc | undefined) ?? null;
  // Community Studio: a published PAGE-SPECIFIC layout override wins over
  // the shared template — THIS PAGE ONLY, other communities untouched
  const pageLayout = (ed.regions["__layout"]?.json as LayoutDoc | undefined) ?? null;
  const builder = draft ? !!draft.builder : tpl.preview && (await isBuilderMode());

  /* Amendment 2: the page-specific conversion-band override rides the
     WINNING layout document's cta-section settings. Absent (today's state
     everywhere) = the code CTA renders byte-for-byte. */
  const ctaOv = hoodCtaFromLayout(pageLayout ?? tplLayout);
  const ctaPrimary = ctaButton(ctaOv?.primaryLabel, ctaOv?.primaryAction, nb
    ? { label: "Discover Builder Incentives", intent: "new-build-incentives" }
    : { label: INTENTS["curated-homes"].cta, intent: "curated-homes" });
  const ctaSecondary = ctaButton(ctaOv?.secondaryLabel, ctaOv?.secondaryAction, { label: "Ask a Question", intent: "ask-a-question" });
  const ctaHasCopy = !!ctaOv && !!(ctaOv.kicker || ctaOv.heading || ctaOv.body);
  const ctaBandIntent: IntentKey = ctaPrimary.intent ?? "curated-homes";

  /* Amendment 4: canonical values carry LOCKED source labels in the builder
     canvas — hover shows where the number comes from and where (if
     anywhere) it can be edited. Public markup carries no attributes. */
  const lockMarket = builder ? "CANONICAL CITY MARKET DATA (NTREIS SNAPSHOT) — NOT EDITABLE" : undefined;
  const lockFacts = builder ? (draft ? "COMMUNITY FACTS — EDIT IN FACTS & MLS TAB" : "COMMUNITY FACTS — CANONICAL DATASET") : undefined;
  const lockCity = builder ? "CANONICAL CITY DATA — NOT EDITABLE" : undefined;
  const lockCommute = builder ? "DRIVE-TIME MODEL (OSRM) — NOT EDITABLE" : undefined;
  const lockIdentity = builder ? (draft ? "COMMUNITY IDENTITY — EDIT IN IDENTITY TAB" : "COMMUNITY IDENTITY — CANONICAL DATASET") : undefined;
  const tagline = textValue(ed.regions["tagline"]) ?? content.tagline;
  const introOv = ed.regions["intro"];
  const homesOv = ed.regions["homes"];
  const faqOv = faqItems(ed.regions["faq"]);
  const faqList = faqOv ?? content.faq;
  const amenitiesOv = ed.regions["amenities"];
  const amenityTexts = amenitiesOv ? bulletTexts(amenitiesOv.json) : null;
  const buyerNotesOv = ed.regions["buyer-notes"];
  const buyerNoteTexts = buyerNotesOv ? bulletTexts(buyerNotesOv.json) : null;

  /* CI-3: approved hero photo (photo_assets is human-gated). Public pages
     render the hero column ONLY when an approved asset exists — no asset
     means the text layout simply owns the row (no public "DROP PHOTO" box;
     the Photo Desk keeps the missing slot as an upload target). */
  const photos = await getApprovedPhotos("neighborhood", `${c.slug}/${h.slug}`);
  const heroPhoto = photos.get(photoKey(`${c.slug}/${h.slug}`, "hero"));

  /* A3: community gallery — APPROVED assets only (the photos map cannot
     hold anything else). The saved page-specific order wins; keys without
     an approved asset are skipped, never placeholdered. Zero approved
     photos hide the section publicly; the builder canvas shows an
     editor-only empty state instead. */
  const entityKey = `${c.slug}/${h.slug}`;
  const approvedGalleryKeys = [...photos.keys()]
    .filter((k) => k.startsWith(`${entityKey}::gallery-`))
    .map((k) => k.split("::")[1])
    .sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)));
  const galleryOrder = hoodGalleryFromLayout(pageLayout ?? tplLayout);
  const galleryPhotos = (galleryOrder ?? approvedGalleryKeys)
    .filter((k) => photos.has(photoKey(entityKey, k)))
    .map((k) => ({ slotKey: k, photo: photos.get(photoKey(entityKey, k))! }));

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
      description: tagline,
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
      // faqList also renders the visible FAQ section below — the schema and
      // the visible content derive from the SAME published data by design
      mainEntity: faqList.map((f) => ({
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
      {ed.preview && !builder && <PreviewBanner route={`/city/${c.slug}/${h.slug}`} />}
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

      {applyLayout(pageLayout ?? tplLayout, TEMPLATE_SECTIONS["template:hood"], {
      hero: (
      <>
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
            data-bb-lock={lockIdentity}
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
            data-bb-note={builder ? "TAGLINE — SELECT THE HERO SECTION, THEN EDIT IT IN THE RIGHT PANEL" : undefined}
            style={{
              margin: "16px 0 0",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "clamp(19px,2.4vw,26px)",
              color: "rgba(29,25,19,.75)",
              animation: "fadeUp .7s ease .3s both",
            }}
          >
            {tagline}
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
                <HeroStat label="PRICED FROM" value={nb.from} color="#D9481F" lock={lockFacts} />
                <HeroStat label="BUILDERS" value={`${nb.builders} ACTIVE`} lock={lockFacts} />
                <HeroStat label="STATUS" value={nb.status} lock={lockFacts} />
                <HeroStat label="SCHOOLS" value={c.isd} lock={lockCity} />
              </>
            ) : (
              <>
                <HeroStat label="CITY MEDIAN" value={fmtK(c.price)} color="#D9481F" lock={lockMarket} />
                <HeroStat label="$ / SQFT (CITY)" value={"$" + c.ppsf} lock={lockMarket} />
                <HeroStat label="SCHOOLS" value={c.isd} lock={lockCity} />
                <HeroStat label="DT DALLAS" value={`${c.commute[0]} MIN`} lock={lockCommute} />
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

      </>
      ),
      vibe: (
      <>
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
            {introOv ? (
              <div data-bb-region={builder ? "intro" : undefined} style={{ fontSize: 17, lineHeight: 1.85, color: "rgba(29,25,19,.82)" }}>
                <RichDoc doc={introOv.json} />
              </div>
            ) : builder ? (
              /* Amendment 4: the generated/fallback intro is selectable and
                 editable in the canvas — committing it creates a
                 page-specific override; the shared formula stays untouched */
              <div data-bb-region="intro" style={{ fontSize: 17, lineHeight: 1.85, color: "rgba(29,25,19,.82)" }}>
                {content.intro.map((para, i) => (
                  <p key={i} style={{ margin: i === 0 ? 0 : "16px 0 0" }}>
                    {para}
                  </p>
                ))}
              </div>
            ) : (
              content.intro.map((para, i) => (
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
              ))
            )}
          </div>
          <div
            data-reveal="1"
            data-bb-lock={builder ? "QUICK FACTS — CANONICAL DATA, NOT EDITABLE ON THE CANVAS" : undefined}
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
            {!nb && (
              <div
                className="font-mono"
                style={{ marginTop: 10, fontSize: 9, letterSpacing: ".16em", color: "rgba(29,25,19,.45)" }}
              >
                DRIVE TIME: OFF-PEAK ESTIMATE · OPENSTREETMAP ROUTING
              </div>
            )}
          </div>
        </div>
      </section>

      </>
      ),
      body: (
      <>
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
              EDITORIAL FIGURES — VERIFY WITH SALES OFFICES
            </span>
          </div>

          <div
            data-reveal="1"
            data-bb-lock={lockFacts}
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
              data-bb-lock={builder ? "LIVE NTREIS INVENTORY — READ-ONLY" : undefined}
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
              {amenitiesOv && !amenityTexts ? (
                <div style={{ fontSize: 15, lineHeight: 1.65 }}>
                  <RichDoc doc={amenitiesOv.json} />
                </div>
              ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
                {(amenityTexts ?? content.newBuild?.amenities ?? [nb.note]).map((a) => (
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
              )}
            </div>
            <div data-reveal="1">
              <h3
                className="font-serif"
                style={{ margin: "0 0 16px", fontWeight: 800, fontSize: 24 }}
              >
                Buyer&apos;s field notes
              </h3>
              {buyerNotesOv && !buyerNoteTexts ? (
                <div style={{ fontSize: 15, lineHeight: 1.7 }}>
                  <RichDoc doc={buyerNotesOv.json} />
                </div>
              ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {(buyerNoteTexts ?? content.newBuild?.buyerNotes ?? []).map((note, i) => (
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
              )}
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
              {homesOv ? (
                <div data-bb-region={builder ? "homes" : undefined} style={{ fontSize: 17, lineHeight: 1.85, color: "rgba(29,25,19,.82)" }}>
                  <RichDoc doc={homesOv.json} />
                </div>
              ) : (
                <p data-bb-region={builder ? "homes" : undefined} style={{ margin: 0, fontSize: 17, lineHeight: 1.85, color: "rgba(29,25,19,.82)" }}>
                  {content.homes}
                </p>
              )}
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
            {/* photo column exists only with an approved asset — otherwise the
                text column owns the row (auto-fit grid stretches it) */}
            {heroPhoto && (
              <div data-reveal="1">
                <EditorialPhoto
                  photo={heroPhoto}
                  priority
                  className="gallery-slot"
                  style={{
                    aspectRatio: "4 / 3",
                    border: "2px solid #1D1913",
                    borderRadius: 18,
                  }}
                >
                  {null}
                </EditorialPhoto>
              </div>
            )}
          </div>
        </section>
      )}

      </>
      ),
      cta: (
      <>
      {/* Standard-neighborhood CTA keeps its place here (unchanged by
          default). New-build communities keep their CTA below the "why
          buyers look here" reasons UNTIL a page-specific override exists —
          the override renders here so the admin controls its position.
          One conversion section per page either way. */}
      {!nb && leadBackendReady() && (
        ctaHasCopy ? (
          <NewBuildCTA
            citySlug={c.slug}
            community={h.slug}
            kicker={ctaOv?.kicker ?? INTENTS[ctaBandIntent].kicker}
            heading={ctaOv?.heading ?? INTENTS[ctaBandIntent].headline}
            body={ctaOv?.body ?? INTENTS[ctaBandIntent].body}
            primary={ctaPrimary}
            secondary={ctaOv?.hideSecondary ? null : ctaSecondary}
          />
        ) : (
          <ConvertSlot id="hood-cta">
            <ConversionDuo
              primary={ctaPrimary.intent ?? "curated-homes"}
              secondary={ctaOv?.hideSecondary ? undefined : (ctaSecondary.intent ?? "ask-a-question")}
              primaryLabel={ctaPrimary.label}
              secondaryLabel={ctaOv?.hideSecondary ? undefined : ctaSecondary.label}
              primaryHref={ctaPrimary.href}
              secondaryHref={ctaOv?.hideSecondary ? undefined : ctaSecondary.href}
              citySlug={c.slug}
              community={h.slug}
            />
          </ConvertSlot>
        )
      )}
      {nb && leadBackendReady() && ctaOv && (
        <NewBuildCTA
          citySlug={c.slug}
          community={h.slug}
          kicker={ctaOv.kicker}
          heading={ctaOv.heading}
          body={ctaOv.body}
          primary={ctaPrimary}
          secondary={ctaOv.hideSecondary ? null : ctaSecondary}
        />
      )}

      </>
      ),
      highlights: (
      <>
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

      {/* New-build's ONE conversion moment — an editorial band placed AFTER
          the reasons above and BEFORE nearby schools, so the case is made
          before the ask. Shared across every new-build community. A
          page-specific CTA override moves the band to the Conversion band
          section slot (position becomes the admin's), so it never doubles. */}
      {nb && leadBackendReady() && !ctaOv && <NewBuildCTA citySlug={c.slug} community={h.slug} />}

      </>
      ),
      schools: (
      <>
      {/* 04 · nearby schools — proximity context ONLY (no boundary data):
          nearest rated neighborhood campus per level, measured from the city
          centroid because hoods carry no coordinates of their own. Copy must
          never claim assignment; section hides cleanly when the dataset has
          nothing for this city. */}
      {nearbySchoolsFor(c.slug).length > 0 && (
        <section style={{ maxWidth: 1280, margin: "0 auto", padding: "84px 4vw 0" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(min(400px,90vw),1fr))",
              gap: 48,
              alignItems: "start",
            }}
          >
            <div data-reveal="1">
              <Eyebrow>04 — NEARBY SCHOOLS</Eyebrow>
              <SectionH2 style={{ marginBottom: 16 }}>
                A few schools near {h.name}.
              </SectionH2>
              <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.75, color: "rgba(29,25,19,.7)" }}>
                School assignments can vary by address. Use this as nearby
                context, then verify current boundaries with the district.
              </p>
              <div
                className="font-mono"
                style={{ marginTop: 16, fontSize: 9, letterSpacing: ".16em", color: "rgba(29,25,19,.45)" }}
              >
                TEA {NEARBY_SCHOOLS_META.ratingYear} A–F RATINGS · TXSCHOOLS.GOV · RETRIEVED{" "}
                {NEARBY_SCHOOLS_META.retrieved} · NEAREST RATED CAMPUS PER LEVEL
              </div>
            </div>
            <div
              data-reveal="1"
              style={{ border: "2px solid #1D1913", borderRadius: 18, background: "#FBF7EE", overflow: "hidden" }}
            >
              {nearbySchoolsFor(c.slug).map((s, i, arr) => (
                <div
                  key={s.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "17px 22px",
                    borderBottom: i === arr.length - 1 ? undefined : "1px solid rgba(29,25,19,.14)",
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
                      background: s.rating === "A" ? "#1D1913" : "#FBF7EE",
                      color: s.rating === "A" ? "#F6F1E6" : "#1D1913",
                      flexShrink: 0,
                    }}
                  >
                    {s.rating}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="font-serif" style={{ display: "block", fontWeight: 700, fontSize: 17, lineHeight: 1.2 }}>
                      {s.name}
                    </span>
                    <span
                      className="font-mono"
                      style={{ display: "block", marginTop: 4, fontSize: 9, letterSpacing: ".14em", color: "rgba(29,25,19,.55)" }}
                    >
                      {s.district.toUpperCase()} · {s.miles.toFixed(1)} MI FROM {c.name.toUpperCase()} CENTER
                    </span>
                  </span>
                  <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".18em", color: "rgba(29,25,19,.55)" }}>
                    {s.level.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      </>
      ),
      faq: (
      <>
      {/* 05 · FAQ */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "84px 4vw" }}>
        <div data-reveal="1" style={{ marginBottom: 30 }}>
          <Eyebrow>05 — GOOD QUESTIONS</Eyebrow>
          <SectionH2>Asked about {h.name}, answered straight.</SectionH2>
        </div>
        <div data-reveal="1" style={{ display: "grid", gap: 0, border: "2px solid #1D1913", borderRadius: 18, background: "#FBF7EE", overflow: "hidden" }}>
          {faqList.map((f, i) => (
            <div
              key={f.q}
              style={{
                padding: "24px 28px",
                borderBottom: i === faqList.length - 1 ? undefined : "1px solid rgba(29,25,19,.14)",
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

      {/* second CTA region removed — one CTA section per page. The builder
          tour / inventory repeat both collapsed into the single ask above. */}

      </>
      ),
      gallery: (
      <>
      {/* community gallery — approved frames only; the section hides
          entirely when none exist (no public "DROP PHOTO" placeholders; the
          Photo Desk keeps the missing slots). Mirrors the city gallery. */}
      {galleryPhotos.length > 0 ? (
        <section style={{ maxWidth: 1280, margin: "0 auto", padding: "84px 4vw 0" }}>
          <div data-reveal="1" style={{ marginBottom: 30 }}>
            <Eyebrow>THE LOOK</Eyebrow>
            <SectionH2>
              {galleryPhotos.length === 1 ? `One frame of ${h.name}.` : galleryPhotos.length === 2 ? `Two frames of ${h.name}.` : `Scenes from ${h.name}.`}
            </SectionH2>
          </div>
          <div
            data-reveal="1"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }}
          >
            {galleryPhotos.map(({ slotKey, photo }) => (
              <EditorialPhoto
                key={slotKey}
                photo={photo}
                className="gallery-slot"
                style={{
                  aspectRatio: "4 / 3",
                  border: "2px solid #1D1913",
                  borderRadius: 18,
                }}
              >
                {null}
              </EditorialPhoto>
            ))}
          </div>
        </section>
      ) : builder ? (
        /* editor-only empty state — NEVER rendered publicly */
        <section style={{ maxWidth: 1280, margin: "0 auto", padding: "42px 4vw 0" }}>
          <div
            className="font-mono"
            style={{ border: "2px dashed rgba(29,25,19,.4)", borderRadius: 18, padding: "26px 28px", fontSize: 11, lineHeight: 1.9, color: "rgba(29,25,19,.6)", letterSpacing: ".08em" }}
          >
            COMMUNITY GALLERY — NO APPROVED PHOTOS YET.
            <br />This section stays HIDDEN on the public page until at least one gallery photo is approved in the Photo Desk. Upload candidates from the Studio&rsquo;s PHOTOS tab; approval remains the Photo Desk&rsquo;s audited action.
          </div>
        </section>
      ) : null}
      </>
      ),
      explore: (
      <>
      {/* 05 · keep exploring */}
      <section style={{ borderTop: "2px solid #1D1913", background: "#1D1913", color: "#F6F1E6" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "84px 4vw" }}>
          <div data-reveal="1" style={{ marginBottom: 34 }}>
            <div
              className="font-mono"
              style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".32em", color: "#E88D6B", marginBottom: 14 }}
            >
              06 — KEEP EXPLORING
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
            {/* conversion CTAs — links only, no popups: live search scoped to
                this city, and the Sunday newsletter */}
            <Link
              href={`/homes?city=${c.slug}`}
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
                {isLiveMls ? "LIVE MLS SEARCH" : "SEARCH PREVIEW"}
              </div>
              <div className="font-serif" style={{ fontWeight: 800, fontSize: 21, marginTop: 9, lineHeight: 1.15 }}>
                Search {c.name} homes →
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "rgba(246,241,230,.65)", marginTop: 8 }}>
                Every active listing near {h.name}, on the map.
              </div>
            </Link>
            <Link
              href="/#newsletter"
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
                THE LETTER
              </div>
              <div className="font-serif" style={{ fontWeight: 800, fontSize: 21, marginTop: 9, lineHeight: 1.15 }}>
                Get the Sunday brief →
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "rgba(246,241,230,.65)", marginTop: 8 }}>
                What listed, what went under contract, and what changed — every Sunday.
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

      </>
      ),
      }, undefined, builder)}
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

function HeroStat({ label, value, color, lock }: { label: string; value: string; color?: string; lock?: string }) {
  return (
    <div data-bb-lock={lock} style={{ border: "1.5px solid rgba(29,25,19,.35)", borderRadius: 14, padding: "11px 16px", background: "#FBF7EE" }}>
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
