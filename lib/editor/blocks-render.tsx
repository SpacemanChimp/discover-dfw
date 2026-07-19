/* Visual Builder block renderer — SERVER-ONLY composition of sanitized
   layout documents into the existing Discover DFW components. The ONLY
   path builder blocks take to a public page. No dangerouslySetInnerHTML;
   protected blocks render the real site components with their data and
   plumbing untouched (an admin controls placement, never behavior). */
import "server-only";
import React from "react";
import Link from "next/link";
import { isLiveMls, getMlsProvider } from "@/lib/mls";
import { cities, bySlug, project } from "@/lib/dfw-data";
import { getCityMarketMetricSet, fmtMetricValue, provenanceLabel } from "@/lib/market/metrics";
import { leadBackendReady } from "@/lib/convert/config";
import { RichDoc } from "./render";
import type { BlockInstance, BlockImage, BlockButton, LayoutDoc, LayoutEntry, SectionDef, StyleSettings } from "./blocks.ts";
import Newsletter from "@/components/Newsletter";
import CityIndex from "@/components/CityIndex";
import NewBuildDirectory from "@/components/newbuild/NewBuildDirectory";
import InteractiveMap from "@/components/InteractiveMap";
import ConvertSlot from "@/components/convert/ConvertSlot";
import ConversionDuo from "@/components/convert/ConversionDuo";
import ListingCardLedger from "@/components/search/ListingCardLedger";

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const CARD = "#FBF7EE";
const ORANGE = "#D9481F";
const ORANGE_DARK = "#C13E17";

const TREATMENT: Record<StyleSettings["treatment"], React.CSSProperties> = {
  parchment: { background: CREAM, color: INK },
  white: { background: CARD, color: INK, borderTop: `2px solid ${INK}` },
  ink: { background: INK, color: CREAM, borderTop: `2px solid ${INK}` },
  orange: { background: ORANGE, color: CREAM, borderTop: `2px solid ${INK}` },
};
const PAD: Record<StyleSettings["spacing"], string> = { sm: "28px", md: "52px", lg: "84px" };

export function visibilityClass(v: string | undefined): string | undefined {
  if (v === "desktop") return "bb-desktop-only";
  if (v === "mobile") return "bb-mobile-only";
  return undefined;
}

function Buttons({ buttons, onInk }: { buttons: BlockButton[]; onInk: boolean }) {
  if (!buttons?.length) return null;
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 22 }} className="bb-buttons">
      {buttons.map((b, i) =>
        b.style === "primary" ? (
          <Link key={i} href={b.href} style={{ background: ORANGE, color: CREAM, border: `2px solid ${ORANGE}`, borderRadius: 999, padding: "13px 26px", fontWeight: 700, fontSize: 14.5, textDecoration: "none", boxShadow: "0 8px 20px rgba(217,72,31,.24)", whiteSpace: "nowrap" }}>
            {b.label}
          </Link>
        ) : (
          <Link key={i} href={b.href} style={{ background: "transparent", color: onInk ? CREAM : INK, border: `2px solid ${onInk ? CREAM : INK}`, borderRadius: 999, padding: "13px 26px", fontWeight: 700, fontSize: 14.5, textDecoration: "none", whiteSpace: "nowrap" }}>
            {b.label}
          </Link>
        )
      )}
    </div>
  );
}

function Figure({ image, height }: { image: BlockImage; height?: number }) {
  const pos = image.focal === "center" ? "center" : image.focal;
  return (
    <figure className="ed-figure" style={{ margin: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.src} alt={image.alt} loading="lazy" decoding="async" style={{ width: "100%", height: height ?? "auto", objectFit: height ? "cover" : undefined, objectPosition: pos, display: "block", border: `2px solid ${INK}`, borderRadius: 14 }} />
      {(image.caption || image.attribution) && (
        <figcaption style={{ marginTop: 7, fontSize: 12, lineHeight: 1.5, opacity: 0.72 }}>
          {image.caption}
          {image.caption && image.attribution ? " · " : ""}
          {image.attribution && <span className="font-mono ed-attribution">{image.attribution}</span>}
        </figcaption>
      )}
    </figure>
  );
}

/* ---------------------------------------------------------------- blocks */
async function BlockBody({ block, citySlug }: { block: BlockInstance; citySlug?: string }) {
  const s = block.settings as Record<string, never> & Record<string, unknown>;
  const onInk = block.style.treatment === "ink" || block.style.treatment === "orange";

  switch (block.type) {
    case "hero": {
      const H = (s.level as string) === "h1" ? "h1" : "h2";
      return (
        <div style={{ maxWidth: 860, margin: block.style.align === "center" ? "0 auto" : undefined }}>
          {s.kicker ? (
            <div className="font-mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".32em", color: onInk ? "#E88D6B" : ORANGE_DARK, marginBottom: 14 }}>
              {String(s.kicker).toUpperCase()}
            </div>
          ) : null}
          <H className="font-serif" style={{ margin: 0, fontWeight: 900, fontSize: "clamp(34px,4.6vw,56px)", lineHeight: 1.04 }}>
            {String(s.heading ?? "")}
          </H>
          {s.sub ? (
            <p className="font-serif" style={{ margin: "16px 0 0", fontStyle: "italic", fontWeight: 500, fontSize: "clamp(18px,2.3vw,24px)", lineHeight: 1.5, opacity: 0.85 }}>
              {String(s.sub)}
            </p>
          ) : null}
          <Buttons buttons={(s.buttons as BlockButton[]) ?? []} onInk={onInk} />
        </div>
      );
    }
    case "richtext":
      return (
        <div style={{ maxWidth: 860, margin: block.style.align === "center" ? "0 auto" : undefined, fontSize: 16, lineHeight: 1.75 }}>
          <RichDoc doc={s.doc} />
        </div>
      );
    case "image":
    case "editorialPhoto": {
      const image = s.image as BlockImage;
      const placement = String(s.placement ?? "full");
      const width = placement === "left" || placement === "right" ? "min(520px, 100%)" : "100%";
      return (
        <div style={{ display: "flex", justifyContent: placement === "right" ? "flex-end" : placement === "left" ? "flex-start" : "center" }}>
          <div style={{ width }}>
            <Figure image={image} />
          </div>
        </div>
      );
    }
    case "imageText": {
      const image = s.image as BlockImage;
      const side = String(s.imageSide ?? "left");
      return (
        <div className="bb-2col" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(380px,90vw),1fr))", gap: 40, alignItems: "center" }}>
          {side === "left" && <Figure image={image} />}
          <div style={{ fontSize: 16, lineHeight: 1.75 }}>
            <RichDoc doc={s.doc} />
          </div>
          {side === "right" && <Figure image={image} />}
        </div>
      );
    }
    case "gallery": {
      const images = (s.images as BlockImage[]) ?? [];
      const cols = Number(s.columns ?? 3);
      return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill,minmax(min(${cols === 2 ? 380 : 280}px,90vw),1fr))`, gap: 18 }}>
          {images.map((im, i) => (
            <Figure key={i} image={im} height={240} />
          ))}
        </div>
      );
    }
    case "cta":
      return (
        <div className="nb-cta-band">
          <div className="nb-cta-copy">
            {s.kicker ? (
              <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".24em", fontWeight: 700, color: onInk ? "#E88D6B" : ORANGE_DARK }}>
                {String(s.kicker).toUpperCase()}
              </div>
            ) : null}
            <h2 className="font-serif" style={{ margin: "8px 0 0", fontWeight: 800, fontSize: "clamp(20px,2.4vw,25px)", lineHeight: 1.15 }}>
              {String(s.heading ?? "")}
            </h2>
            {s.body ? <p style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.6, opacity: 0.75, maxWidth: 560 }}>{String(s.body)}</p> : null}
          </div>
          <div className="nb-cta-actions">
            <Buttons buttons={(s.buttons as BlockButton[]) ?? []} onInk={onInk} />
          </div>
        </div>
      );
    case "faq": {
      const items = (s.items as { q: string; a: string }[]) ?? [];
      return (
        <div style={{ display: "grid", gap: 0, border: `2px solid ${INK}`, borderRadius: 18, background: CARD, color: INK, overflow: "hidden" }}>
          {items.map((f, i) => (
            <div key={i} style={{ padding: "24px 28px", borderBottom: i === items.length - 1 ? undefined : "1px solid rgba(29,25,19,.14)" }}>
              <h3 className="font-serif" style={{ margin: 0, fontWeight: 800, fontSize: 20, lineHeight: 1.25 }}>{f.q}</h3>
              <p style={{ margin: "10px 0 0", fontSize: 15.5, lineHeight: 1.75, color: "rgba(29,25,19,.75)" }}>{f.a}</p>
            </div>
          ))}
        </div>
      );
    }
    case "featureGrid": {
      const items = (s.items as { title: string; note: string }[]) ?? [];
      const cols = String(s.columns ?? "3");
      return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(min(${cols === "2" ? 340 : 250}px,90vw),1fr))`, gap: 18 }}>
          {items.map((it, i) => (
            <div key={i} style={{ border: `2px solid ${INK}`, borderRadius: 18, background: CARD, color: INK, padding: "24px 26px" }}>
              <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".22em", color: ORANGE_DARK, fontWeight: 700 }}>N°{i + 1}</div>
              <div className="font-serif" style={{ fontWeight: 800, fontSize: 23, marginTop: 10, lineHeight: 1.1 }}>{it.title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(29,25,19,.68)", marginTop: 9 }}>{it.note}</div>
            </div>
          ))}
        </div>
      );
    }
    case "statsBand": {
      const items = (s.items as { value: string; label: string }[]) ?? [];
      return (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 24 }}>
            {items.map((it, i) => (
              <div key={i}>
                <div className="font-serif" style={{ fontWeight: 900, fontSize: "clamp(34px,4vw,52px)", lineHeight: 1 }}>{it.value}</div>
                <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".2em", marginTop: 8, opacity: 0.6 }}>{it.label.toUpperCase()}</div>
              </div>
            ))}
          </div>
          {s.note ? <div className="font-mono" style={{ marginTop: 18, fontSize: 9, letterSpacing: ".16em", opacity: 0.5 }}>{String(s.note).toUpperCase()}</div> : null}
        </div>
      );
    }
    case "quote":
      return (
        <blockquote style={{ margin: 0, maxWidth: 760, marginInline: block.style.align === "center" ? "auto" : undefined }}>
          <p className="font-serif" style={{ margin: 0, fontStyle: "italic", fontWeight: 600, fontSize: "clamp(22px,2.6vw,32px)", lineHeight: 1.4 }}>
            “{String(s.text ?? "")}”
          </p>
          {s.cite ? <cite className="font-mono" style={{ display: "block", marginTop: 14, fontSize: 10, letterSpacing: ".2em", fontStyle: "normal", opacity: 0.6 }}>— {String(s.cite).toUpperCase()}</cite> : null}
        </blockquote>
      );
    case "divider":
      return String(s.line) === "double" ? (
        <div><div style={{ height: 3, background: "currentColor" }} /><div style={{ height: 1, background: "currentColor", marginTop: 3 }} /></div>
      ) : (
        <div style={{ height: 2, background: "currentColor", opacity: 0.85 }} />
      );
    case "spacer":
      return <div aria-hidden="true" style={{ height: { sm: 24, md: 56, lg: 96 }[String(s.size) as "sm" | "md" | "lg"] ?? 56 }} />;
    case "newsletter":
      return <Newsletter />;
    case "leadForm": {
      if (!leadBackendReady()) return null;
      const primary = String(s.primary ?? "ask-a-question") as "ask-a-question";
      return (
        <div>
          {s.heading ? (
            <h2 className="font-serif" style={{ margin: "0 0 6px", fontWeight: 800, fontSize: "clamp(22px,2.6vw,30px)", textAlign: "center" }}>{String(s.heading)}</h2>
          ) : null}
          <ConvertSlot>
            <ConversionDuo primary={primary} secondary="ask-a-question" secondaryLabel="Ask a Question" citySlug={citySlug} />
          </ConvertSlot>
        </div>
      );
    }
    case "cityIndex":
      return <CityIndex />;
    case "communityDirectory":
      return <NewBuildDirectory />;
    case "metroMap":
      return <InteractiveMap liveMls={isLiveMls} />;
    case "featuredListings": {
      try {
        const provider = getMlsProvider();
        const count = Number(s.count ?? 3);
        const result = await provider.searchListings({
          citySlug: (s.citySlug as string) || undefined,
          maxPrice: s.maxPrice ? Number(s.maxPrice) : undefined,
          newBuildsOnly: s.newBuildsOnly === true || undefined,
          pageSize: count,
        });
        if (!result.listings.length) return null;
        return (
          <div>
            {s.heading ? (
              <h2 className="font-serif" style={{ margin: "0 0 20px", fontWeight: 800, fontSize: "clamp(24px,3vw,34px)" }}>{String(s.heading)}</h2>
            ) : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(320px,90vw),1fr))", gap: 18, color: INK }}>
              {result.listings.slice(0, count).map((l) => (
                <ListingCardLedger key={l.listingKey} listing={l} cityName={bySlug[l.citySlug]?.name || l.cityName} />
              ))}
            </div>
            <div className="font-mono" style={{ marginTop: 14, fontSize: 9, letterSpacing: ".16em", opacity: 0.55 }}>
              {isLiveMls ? "LIVE NTREIS LISTINGS — ATTRIBUTION ON EVERY CARD" : "SAMPLE INVENTORY — FICTIONAL UNTIL THE LIVE FEED"}
            </div>
          </div>
        );
      } catch {
        return null; // a data failure never breaks the page
      }
    }
    case "marketSnapshot": {
      try {
        const set = await getCityMarketMetricSet(String(s.citySlug ?? ""));
        if (!set) return null;
        const wanted: { key: "median_active_list_price" | "median_price_per_sqft" | "median_days_on_market" | "active_listing_count"; label: string }[] = [
          { key: "median_active_list_price", label: "MEDIAN ACTIVE LIST PRICE" },
          { key: "median_price_per_sqft", label: "MEDIAN $ / SQFT" },
          { key: "median_days_on_market", label: "MEDIAN DAYS ON MARKET" },
          { key: "active_listing_count", label: "ACTIVE LISTINGS NOW" },
        ];
        const metrics = wanted.map((w) => ({ label: w.label, m: set.metrics[w.key] })).filter((x) => x.m);
        if (!metrics.length) return null;
        return (
          <div>
            <h2 className="font-serif" style={{ margin: "0 0 18px", fontWeight: 800, fontSize: "clamp(22px,2.6vw,30px)" }}>{set.cityName} market snapshot</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 18, color: INK }}>
              {metrics.map((x) => (
                <div key={x.label} style={{ border: `2px solid ${INK}`, borderRadius: 18, background: CARD, padding: "18px 20px" }}>
                  <div className="font-mono" style={{ fontSize: 9, letterSpacing: ".18em", color: "rgba(29,25,19,.5)" }}>{x.label}</div>
                  <div className="font-serif" style={{ fontWeight: 900, fontSize: 30, marginTop: 6 }}>{fmtMetricValue(x.m!)}</div>
                </div>
              ))}
            </div>
            <div className="font-mono" style={{ marginTop: 12, fontSize: 9, letterSpacing: ".14em", opacity: 0.55 }}>{provenanceLabel(set).toUpperCase()}</div>
          </div>
        );
      } catch {
        return null;
      }
    }
    case "searchPromo":
      return (
        <div className="nb-cta-band">
          <div className="nb-cta-copy">
            <h2 className="font-serif" style={{ margin: 0, fontWeight: 800, fontSize: "clamp(20px,2.4vw,25px)", lineHeight: 1.15 }}>{String(s.heading ?? "Search the market")}</h2>
            {s.body ? <p style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.6, opacity: 0.75, maxWidth: 560 }}>{String(s.body)}</p> : null}
          </div>
          <div className="nb-cta-actions">
            <Buttons buttons={[{ label: String(s.buttonLabel ?? "Open the search"), href: String(s.target ?? "/homes"), style: "primary" }]} onInk={onInk} />
          </div>
        </div>
      );
    case "nearbyAreas": {
      const c = bySlug[String(s.citySlug ?? "")];
      if (!c) return null;
      const p0 = project(c.ll);
      const near = cities
        .filter((x) => x.slug !== c.slug)
        .map((x) => { const p1 = project(x.ll); return { x, d: (p0[0] - p1[0]) ** 2 + (p0[1] - p1[1]) ** 2 }; })
        .sort((a, b) => a.d - b.d)
        .slice(0, Number(s.count ?? 3))
        .map((e) => e.x);
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(250px,90vw),1fr))", gap: 18 }}>
          {near.map((n) => (
            <Link key={n.slug} href={`/city/${n.slug}`} className="hood-card" style={{ border: `2px solid ${INK}`, borderRadius: 18, background: CARD, color: INK, padding: "22px 24px", textDecoration: "none", display: "block" }}>
              <div className="font-mono" style={{ fontSize: 9, letterSpacing: ".2em", color: ORANGE_DARK, fontWeight: 700 }}>NEAR {c.name.toUpperCase()}</div>
              <div className="font-serif" style={{ fontWeight: 800, fontSize: 21, marginTop: 9 }}>{n.name}, TX →</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "rgba(29,25,19,.65)", marginTop: 8 }}>{n.tagline}</div>
            </Link>
          ))}
        </div>
      );
    }
    default:
      return null; // unknown types render nothing — the sanitizer refuses them anyway
  }
}

/** one builder block → a styled site section */
export async function BuilderBlock({ block, citySlug }: { block: BlockInstance; citySlug?: string }) {
  if (block.hidden) return null;
  // full-bleed site components own their own section shells
  if (["newsletter", "cityIndex", "communityDirectory", "metroMap"].includes(block.type)) {
    return (
      <div className={visibilityClass(block.visibility)}>
        <BlockBody block={block} citySlug={citySlug} />
      </div>
    );
  }
  const t = TREATMENT[block.style.treatment] ?? TREATMENT.parchment;
  return (
    <section className={visibilityClass(block.visibility)} style={t}>
      <div
        style={{
          maxWidth: block.style.width === "constrained" ? 1280 : undefined,
          margin: "0 auto",
          padding: `${PAD[block.style.spacing]} 4vw`,
          textAlign: block.style.align === "center" ? "center" : undefined,
        }}
      >
        <BlockBody block={block} citySlug={citySlug} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ applyLayout */
/** Compose a page from its code-owned sections + an optional published
    layout. No layout → exactly today's code order. With a layout: sections
    reorder/hide per the document, admin blocks render between them, and
    required/locked sections are ALWAYS rendered even if a bad document
    omitted them (fail-safe — the public page can never lose its H1,
    search room, or compliance content). */
export function applyLayout(
  layout: LayoutDoc | null,
  sectionDefs: SectionDef[],
  rendered: Record<string, React.ReactNode>,
  citySlug?: string
): React.ReactNode[] {
  if (!layout || !Array.isArray(layout.blocks)) {
    return sectionDefs.map((d) => <React.Fragment key={d.key}>{rendered[d.key]}</React.Fragment>);
  }
  const out: React.ReactNode[] = [];
  const used = new Set<string>();
  for (const entry of layout.blocks as LayoutEntry[]) {
    if (entry.kind === "section") {
      const def = sectionDefs.find((s) => s.key === entry.key);
      if (!def) continue;
      used.add(entry.key);
      const mustShow = def.required || def.locked;
      if (entry.hidden && !mustShow) continue;
      const node = rendered[entry.key];
      if (!node) continue;
      const cls = visibilityClass(entry.visibility);
      out.push(
        cls && !mustShow ? (
          <div key={`s-${entry.key}`} className={cls}>{node}</div>
        ) : (
          <React.Fragment key={`s-${entry.key}`}>{node}</React.Fragment>
        )
      );
    } else if (entry.kind === "block" && entry.block && !entry.block.hidden) {
      out.push(<BuilderBlock key={`b-${entry.block.id}`} block={entry.block} citySlug={citySlug} />);
    }
  }
  // fail-safe: required/locked sections a bad layout omitted
  for (const def of sectionDefs) {
    if ((def.required || def.locked) && !used.has(def.key) && rendered[def.key]) {
      out.push(<React.Fragment key={`fs-${def.key}`}>{rendered[def.key]}</React.Fragment>);
    }
  }
  return out;
}

/** FAQ items across a layout's visible faq blocks — drives FAQPage JSON-LD
    on custom pages from the SAME published data the page renders. */
export function layoutFaqItems(layout: LayoutDoc | null): { q: string; a: string }[] {
  if (!layout) return [];
  const out: { q: string; a: string }[] = [];
  for (const e of layout.blocks) {
    if (e.kind === "block" && e.block.type === "faq" && !e.block.hidden) {
      for (const it of (e.block.settings.items as { q: string; a: string }[]) ?? []) out.push(it);
    }
  }
  return out;
}
