/* Visual Builder block model — PURE and self-contained (no React, no
   server imports), the Phase-2 counterpart to doc.ts. Everything an admin
   can express in the builder is validated HERE, server-side, against
   closed enums and the sanitizers from doc.ts. There is no path to raw
   HTML, scripts, arbitrary CSS/colors/fonts, negative spacing, or embeds:
   unknown block types, unknown settings values, and unsafe URLs are
   refused or coerced to safe defaults.

   A LAYOUT document is an ordered list of entries:
     { kind: "section", key, hidden?, visibility? }   — a code-owned template section
     { kind: "block",   block: BlockInstance }        — an admin-added block
   Template pages start life as pure section lists (the code-owned outline
   in TEMPLATE_SECTIONS); custom pages are block lists only. Required
   sections can never be removed or hidden; locked sections carry no
   editable settings. Tested by scripts/tests/builder-core.test.mjs. */

import {
  sanitizeRichDoc,
  sanitizeFaq,
  isAllowedLinkHref,
  isAllowedImageSrc,
  type PMNode,
} from "./doc.ts";

/* ---------------------------------------------------------------- enums */
export const TREATMENTS = ["parchment", "ink", "white", "orange"] as const;
export const WIDTHS = ["constrained", "full"] as const;
export const ALIGNS = ["left", "center", "split"] as const;
export const SPACINGS = ["sm", "md", "lg"] as const;
export const COLUMNS = ["1", "2", "3"] as const;
export const VISIBILITIES = ["all", "desktop", "mobile"] as const;
export const IMAGE_PLACEMENTS = ["full", "left", "right", "background"] as const;
export const FOCALS = ["center", "top", "bottom", "left", "right"] as const;
export const BUTTON_STYLES = ["primary", "secondary"] as const;

export interface StyleSettings {
  treatment: (typeof TREATMENTS)[number];
  width: (typeof WIDTHS)[number];
  align: (typeof ALIGNS)[number];
  spacing: (typeof SPACINGS)[number];
}

export interface BlockButton {
  label: string;
  href: string;
  style: (typeof BUTTON_STYLES)[number];
}

export interface BlockImage {
  src: string;
  alt: string;
  caption: string;
  attribution: string;
  mediaId: string | null;
  focal: (typeof FOCALS)[number];
}

export interface BlockInstance {
  id: string;
  type: string;
  hidden: boolean;
  visibility: (typeof VISIBILITIES)[number];
  style: StyleSettings;
  settings: Record<string, unknown>;
}

export type LayoutEntry =
  | { kind: "section"; key: string; hidden: boolean; visibility: (typeof VISIBILITIES)[number] }
  | { kind: "block"; block: BlockInstance };

export interface LayoutDoc {
  type: "layout";
  blocks: LayoutEntry[];
}

/* ------------------------------------------------------- block registry */
export interface BlockDef {
  type: string;
  label: string;
  category: "Content" | "Media" | "Conversion" | "Site data" | "Structure";
  /** dynamic plumbing — canvas shows a lock; settings limited to placement */
  protectedBlock?: boolean;
  /** allowed on admin-created pages */
  onCustomPages: boolean;
  /** allowed as insertions on code templates */
  onTemplates: boolean;
  description: string;
}

export const BLOCK_DEFS: BlockDef[] = [
  { type: "hero", label: "Hero", category: "Content", onCustomPages: true, onTemplates: false, description: "Kicker, headline, supporting line, up to two buttons. Owns the page H1 on custom pages." },
  { type: "richtext", label: "Rich Text", category: "Content", onCustomPages: true, onTemplates: true, description: "Paragraphs, H2/H3, lists, quotes, links — the 0018 editor inline." },
  { type: "image", label: "Image", category: "Media", onCustomPages: true, onTemplates: true, description: "One rights-confirmed image with alt, caption, attribution." },
  { type: "imageText", label: "Image + Text", category: "Media", onCustomPages: true, onTemplates: true, description: "Side-by-side image and rich text." },
  { type: "gallery", label: "Gallery", category: "Media", onCustomPages: true, onTemplates: true, description: "Up to eight approved images in a grid." },
  { type: "editorialPhoto", label: "Editorial Photo", category: "Media", onCustomPages: true, onTemplates: true, description: "A single framed editorial photograph with attribution." },
  { type: "cta", label: "CTA Band", category: "Conversion", onCustomPages: true, onTemplates: true, description: "Kicker + headline + copy + approved buttons, field-guide band treatment." },
  { type: "faq", label: "FAQ", category: "Content", onCustomPages: true, onTemplates: true, description: "Q&A list — publishes FAQPage JSON-LD from the same items." },
  { type: "featureGrid", label: "Feature Grid", category: "Content", onCustomPages: true, onTemplates: true, description: "Two- or three-column numbered feature cards." },
  { type: "statsBand", label: "Stats Band", category: "Content", onCustomPages: true, onTemplates: true, description: "Up to four big serif figures with mono labels (editorial values you type)." },
  { type: "quote", label: "Quote", category: "Content", onCustomPages: true, onTemplates: true, description: "Pull quote with optional citation." },
  { type: "divider", label: "Divider", category: "Structure", onCustomPages: true, onTemplates: true, description: "Ink rule between sections." },
  { type: "spacer", label: "Spacer", category: "Structure", onCustomPages: true, onTemplates: true, description: "Bounded vertical breathing room (small / medium / large only)." },
  { type: "newsletter", label: "Newsletter Signup", category: "Conversion", protectedBlock: true, onCustomPages: true, onTemplates: true, description: "The Letter signup — subscription plumbing is locked." },
  { type: "leadForm", label: "Lead / Contact Form", category: "Conversion", protectedBlock: true, onCustomPages: true, onTemplates: true, description: "Existing conversion intents through the normalized lead pipeline — API behavior locked." },
  { type: "cityIndex", label: "City Index", category: "Site data", protectedBlock: true, onCustomPages: true, onTemplates: false, description: "The county-by-county city index with live medians — data locked." },
  { type: "communityDirectory", label: "Community Directory", category: "Site data", protectedBlock: true, onCustomPages: true, onTemplates: false, description: "All new-build communities with county filter — data locked." },
  { type: "metroMap", label: "Interactive Metro Map", category: "Site data", protectedBlock: true, onCustomPages: true, onTemplates: false, description: "The clickable metroplex map — behavior locked." },
  { type: "featuredListings", label: "Featured Listings", category: "Site data", protectedBlock: true, onCustomPages: true, onTemplates: true, description: "Live MLS cards via the existing search provider — safe filters only, attribution always renders." },
  { type: "marketSnapshot", label: "Market Snapshot", category: "Site data", protectedBlock: true, onCustomPages: true, onTemplates: true, description: "A city's canonical market metrics with provenance labels — figures locked." },
  { type: "searchPromo", label: "Listings Search Promo", category: "Site data", protectedBlock: true, onCustomPages: true, onTemplates: true, description: "Heading + intro + button into /homes, /land, or /new-builds. The search itself lives on those pages and is locked." },
  { type: "nearbyAreas", label: "Nearby Areas", category: "Site data", protectedBlock: true, onCustomPages: true, onTemplates: true, description: "Nearest city reports as link cards." },
];

export const BLOCK_DEF_BY_TYPE = new Map(BLOCK_DEFS.map((b) => [b.type, b]));

/* ------------------------------------------- code-owned template outlines */
export interface SectionDef {
  key: string;
  label: string;
  /** cannot be removed or hidden (H1 carriers, search rooms, compliance) */
  required?: boolean;
  /** no settings; shown with a lock — live data / legal / plumbing */
  locked?: boolean;
  description?: string;
}

export const TEMPLATE_SECTIONS: Record<string, SectionDef[]> = {
  "/": [
    { key: "hero", label: "Hero (H1 + search)", required: true, description: "Owns the page H1 and hero search." },
    { key: "ticker", label: "City price ticker", locked: true, description: "Live NTREIS medians — data locked." },
    { key: "map", label: "Interactive metro map", locked: true },
    { key: "picks", label: "Editor's Picks" },
    { key: "stats", label: "Stats band", locked: true, description: "Canonical market figures." },
    { key: "newbuilds", label: "New Builds preview" },
    { key: "cityindex", label: "City Index", locked: true },
    { key: "trust", label: "Human trust strip" },
    { key: "about", label: "About / research" },
    { key: "newsletter", label: "Newsletter signup", locked: true, description: "Subscription plumbing locked." },
  ],
  "/land": [
    { key: "intro", label: "H1 + introduction", required: true },
    { key: "search", label: "Land search (toolbar + rail + map)", required: true, locked: true, description: "The page's required MLS search — cannot be removed." },
    { key: "guide", label: "Buyer-education guide" },
    { key: "cta", label: "Land CTA band" },
  ],
  "/new-builds": [
    { key: "intro", label: "H1 + introduction", required: true },
    { key: "search", label: "New-construction search", required: true, locked: true },
    { key: "directory", label: "Community directory" },
    { key: "guide", label: "Buyer-education guide" },
    { key: "cta", label: "Builder CTA band" },
  ],
  "/how-we-research": [
    { key: "intro", label: "H1 + lead paragraph", required: true },
    { key: "sources", label: "Source rules list" },
    { key: "closing", label: "Closing note + links" },
  ],
  "template:city": [
    { key: "hero", label: "City hero (H1 + locator)", required: true },
    { key: "vibe", label: "01 — The vibe" },
    { key: "cta", label: "City CTA" },
    { key: "market", label: "02 — Market snapshot", locked: true, description: "Canonical market metrics — figures locked." },
    { key: "hoods", label: "03 — Neighborhoods" },
    { key: "schools", label: "04 — Schools", locked: true, description: "TEA ratings — data locked." },
    { key: "commutes", label: "05 — Getting around", locked: true, description: "OSRM drive-time estimates — data locked." },
    { key: "gallery", label: "The look (editorial photos)" },
    { key: "listings", label: "On the market", locked: true, description: "Live MLS tier cards." },
    { key: "nextdoor", label: "Next door — compare" },
  ],
  "template:hood": [
    { key: "hero", label: "Hood hero (H1 + locator)", required: true },
    { key: "vibe", label: "01 — The vibe" },
    { key: "body", label: "02 — Real estate / new-build resources", locked: true, description: "Carries the live NB inventory band on new-build pages." },
    { key: "cta", label: "Conversion band" },
    { key: "highlights", label: "03 — Why people look here" },
    { key: "schools", label: "04 — Nearby schools", locked: true },
    { key: "faq", label: "05 — FAQ (drives FAQPage JSON-LD)" },
    { key: "explore", label: "06 — Keep exploring" },
  ],
};

/** routes the builder can open in layout mode (template-page keys are the
    two dynamic templates; every concrete /city/... page maps onto them) */
export function templateKeyForRoute(route: string): string | null {
  if (TEMPLATE_SECTIONS[route]) return route;
  if (/^\/city\/[^/]+\/[^/]+$/.test(route)) return "template:hood";
  if (/^\/city\/[^/]+$/.test(route)) return "template:city";
  return null;
}

/* ------------------------------------------------------------ sanitizers */
const clean = (v: unknown, max: number): string =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const pick = <T extends readonly string[]>(v: unknown, allowed: T, fallback: T[number]): T[number] =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T[number]) : fallback;

function sanitizeStyle(v: unknown): StyleSettings {
  const s = (v ?? {}) as Record<string, unknown>;
  return {
    treatment: pick(s.treatment, TREATMENTS, "parchment"),
    width: pick(s.width, WIDTHS, "constrained"),
    align: pick(s.align, ALIGNS, "left"),
    spacing: pick(s.spacing, SPACINGS, "md"),
  };
}

function sanitizeButtons(v: unknown, errors: string[], where: string): BlockButton[] {
  const out: BlockButton[] = [];
  for (const b of Array.isArray(v) ? v.slice(0, 2) : []) {
    const label = clean((b as { label?: unknown })?.label, 40);
    const href = String((b as { href?: unknown })?.href ?? "").trim();
    if (!label) continue;
    if (!isAllowedLinkHref(href)) {
      errors.push(`${where}: button link "${href.slice(0, 40)}" is not an allowed URL`);
      continue;
    }
    if (/^\/(admin|account|api|auth)(\/|$)/.test(href)) {
      errors.push(`${where}: buttons may not target admin/account/api/auth routes`);
      continue;
    }
    out.push({ label, href, style: pick((b as { style?: unknown })?.style, BUTTON_STYLES, "primary") });
  }
  return out;
}

function sanitizeImage(
  v: unknown,
  errors: string[],
  where: string,
  opts: { supabaseUrl?: string; requireImageAlt?: boolean }
): BlockImage | null {
  const im = (v ?? {}) as Record<string, unknown>;
  const src = String(im.src ?? "").trim();
  if (!src) return null;
  if (!isAllowedImageSrc(src, opts.supabaseUrl)) {
    errors.push(`${where}: image src must come from the editorial-photos bucket or /images (no remote hotlinks)`);
    return null;
  }
  const alt = clean(im.alt, 300);
  if (opts.requireImageAlt && !alt) errors.push(`${where}: image alt text is required before publication`);
  return {
    src,
    alt,
    caption: clean(im.caption, 300),
    attribution: clean(im.attribution, 160),
    mediaId: typeof im.mediaId === "string" ? im.mediaId.slice(0, 60) : null,
    focal: pick(im.focal, FOCALS, "center"),
  };
}

interface BlockSanitizeCtx {
  errors: string[];
  textParts: string[];
  supabaseUrl?: string;
  requireImageAlt?: boolean;
  pageKind: "custom" | "template";
  citySlugs: Set<string>;
}

/** per-type settings sanitation — closed world; anything unknown is dropped */
function sanitizeBlockSettings(type: string, raw: unknown, ctx: BlockSanitizeCtx): Record<string, unknown> | null {
  const s = (raw ?? {}) as Record<string, unknown>;
  const err = ctx.errors;
  const push = (t: string) => t && ctx.textParts.push(t);
  const richOpts = { allowImages: true, supabaseUrl: ctx.supabaseUrl, requireImageAlt: ctx.requireImageAlt };

  switch (type) {
    case "hero": {
      const heading = clean(s.heading, 120);
      if (!heading) err.push("hero: a headline is required");
      push(heading);
      const sub = clean(s.sub, 300);
      push(sub);
      // template insertions can never mint a second H1
      const level = ctx.pageKind === "custom" ? pick(s.level, ["h1", "h2"] as const, "h1") : "h2";
      return { kicker: clean(s.kicker, 60), heading, sub, level, buttons: sanitizeButtons(s.buttons, err, "hero") };
    }
    case "richtext": {
      const r = sanitizeRichDoc(s.doc, richOpts);
      if (!r.ok) {
        err.push(...r.errors.map((e) => `richtext: ${e}`));
        return null;
      }
      push(r.text);
      return { doc: r.doc };
    }
    case "image":
    case "editorialPhoto": {
      const image = sanitizeImage(s.image, err, type, ctx);
      if (!image) {
        err.push(`${type}: an image is required`);
        return null;
      }
      push(image.caption);
      return { image, placement: pick(s.placement, IMAGE_PLACEMENTS, "full") };
    }
    case "imageText": {
      const image = sanitizeImage(s.image, err, "imageText", ctx);
      if (!image) err.push("imageText: an image is required");
      const r = sanitizeRichDoc(s.doc, richOpts);
      if (!r.ok) err.push(...r.errors.map((e) => `imageText: ${e}`));
      else push(r.text);
      if (!image || !r.ok) return null;
      return { image, doc: r.doc, imageSide: pick(s.imageSide, ["left", "right"] as const, "left") };
    }
    case "gallery": {
      const images: BlockImage[] = [];
      for (const item of Array.isArray(s.images) ? s.images.slice(0, 8) : []) {
        const im = sanitizeImage(item, err, "gallery", ctx);
        if (im) images.push(im);
      }
      if (!images.length) err.push("gallery: at least one image is required");
      return { images, columns: pick(s.columns, COLUMNS, "3") };
    }
    case "cta": {
      const heading = clean(s.heading, 120);
      if (!heading) err.push("cta: a headline is required");
      push(heading);
      push(clean(s.body, 400));
      return { kicker: clean(s.kicker, 60), heading, body: clean(s.body, 400), buttons: sanitizeButtons(s.buttons, err, "cta") };
    }
    case "faq": {
      const f = sanitizeFaq({ items: s.items });
      if (!f.ok) {
        err.push(...f.errors.map((e) => `faq: ${e}`));
        return null;
      }
      push(f.text);
      return { items: ((f.doc as unknown as { attrs: { items: unknown } }).attrs.items as { q: string; a: string }[]) };
    }
    case "featureGrid": {
      const items = (Array.isArray(s.items) ? s.items.slice(0, 6) : [])
        .map((it) => ({ title: clean((it as { title?: unknown })?.title, 80), note: clean((it as { note?: unknown })?.note, 300) }))
        .filter((it) => it.title);
      if (!items.length) err.push("featureGrid: at least one feature is required");
      items.forEach((it) => push(`${it.title} ${it.note}`));
      return { items, columns: pick(s.columns, ["2", "3"] as const, "3") };
    }
    case "statsBand": {
      const items = (Array.isArray(s.items) ? s.items.slice(0, 4) : [])
        .map((it) => ({ value: clean((it as { value?: unknown })?.value, 20), label: clean((it as { label?: unknown })?.label, 60) }))
        .filter((it) => it.value && it.label);
      if (!items.length) err.push("statsBand: at least one figure is required");
      return { items, note: clean(s.note, 160) };
    }
    case "quote": {
      const text = clean(s.text, 400);
      if (!text) err.push("quote: text is required");
      push(text);
      return { text, cite: clean(s.cite, 80) };
    }
    case "divider":
      return { line: pick(s.line, ["rule", "double"] as const, "rule") };
    case "spacer":
      return { size: pick(s.size, SPACINGS, "md") };
    case "newsletter":
    case "cityIndex":
    case "communityDirectory":
    case "metroMap":
      return {}; // protected plumbing — placement/style only
    case "leadForm":
      return {
        heading: clean(s.heading, 120),
        primary: pick(s.primary, ["curated-homes", "build-my-shortlist", "ask-a-question"] as const, "ask-a-question"),
      };
    case "featuredListings": {
      const citySlug = typeof s.citySlug === "string" && ctx.citySlugs.has(s.citySlug) ? s.citySlug : "";
      return {
        heading: clean(s.heading, 120),
        citySlug,
        maxPrice: pick(s.maxPrice, ["", "400000", "600000", "800000", "1000000"] as const, ""),
        count: pick(s.count, ["3", "6"] as const, "3"),
        newBuildsOnly: s.newBuildsOnly === true,
      };
    }
    case "marketSnapshot": {
      const citySlug = typeof s.citySlug === "string" && ctx.citySlugs.has(s.citySlug) ? s.citySlug : "";
      if (!citySlug) ctx.errors.push("marketSnapshot: choose a city");
      return { citySlug };
    }
    case "searchPromo":
      return {
        heading: clean(s.heading, 120),
        body: clean(s.body, 300),
        target: pick(s.target, ["/homes", "/land", "/new-builds"] as const, "/homes"),
        buttonLabel: clean(s.buttonLabel, 40) || "Open the search",
      };
    case "nearbyAreas": {
      const citySlug = typeof s.citySlug === "string" && ctx.citySlugs.has(s.citySlug) ? s.citySlug : "";
      if (!citySlug) ctx.errors.push("nearbyAreas: choose a city");
      return { citySlug, count: pick(s.count, ["3", "4", "6"] as const, "3") };
    }
    default:
      err.push(`unknown block type "${type}"`);
      return null;
  }
}

export interface LayoutSanitizeResult {
  ok: boolean;
  errors: string[];
  doc?: LayoutDoc;
  text: string;
}

const ID_RE = /^[a-z0-9][a-z0-9-]{3,29}$/;
export const MAX_LAYOUT_ENTRIES = 60;

export function sanitizeLayout(
  input: unknown,
  opts: {
    pageKind: "custom" | "template";
    sections?: SectionDef[];
    supabaseUrl?: string;
    requireImageAlt?: boolean;
    citySlugs?: string[];
    /** validating a lone entry for the builder canvas (render-block): the
        per-block rules all apply, but whole-page rules (required sections
        present, H1 count/position) can't be judged on a fragment — the
        full-layout save/publish path always re-validates them. */
    fragment?: boolean;
  }
): LayoutSanitizeResult {
  const errors: string[] = [];
  const root = input as LayoutDoc;
  if (!root || typeof root !== "object" || root.type !== "layout" || !Array.isArray(root.blocks)) {
    return { ok: false, errors: ["layout must be { type:'layout', blocks:[…] }"], text: "" };
  }
  if (JSON.stringify(input).length > 400_000) {
    return { ok: false, errors: ["layout document is too large"], text: "" };
  }
  if (/<\s*script|javascript:|onerror\s*=|onload\s*=/i.test(JSON.stringify(input))) {
    errors.push("script-shaped content is not allowed");
  }
  if (root.blocks.length > MAX_LAYOUT_ENTRIES) errors.push(`too many entries (${root.blocks.length}; limit ${MAX_LAYOUT_ENTRIES})`);

  const sections = opts.sections ?? [];
  const sectionByKey = new Map(sections.map((s) => [s.key, s]));
  const ctx: BlockSanitizeCtx = {
    errors,
    textParts: [],
    supabaseUrl: opts.supabaseUrl,
    requireImageAlt: opts.requireImageAlt,
    pageKind: opts.pageKind,
    citySlugs: new Set(opts.citySlugs ?? []),
  };

  const out: LayoutEntry[] = [];
  const seenSections = new Set<string>();
  const seenIds = new Set<string>();
  let h1Count = 0;

  for (const e of root.blocks.slice(0, MAX_LAYOUT_ENTRIES)) {
    const entry = e as LayoutEntry;
    if ((entry as { kind?: unknown }).kind === "section") {
      const key = String((entry as { key?: unknown }).key ?? "");
      const def = sectionByKey.get(key);
      if (!def) {
        errors.push(`unknown template section "${key}"`);
        continue;
      }
      if (seenSections.has(key)) {
        errors.push(`section "${key}" appears twice`);
        continue;
      }
      seenSections.add(key);
      const hidden = (entry as { hidden?: unknown }).hidden === true;
      if (hidden && (def.required || def.locked)) {
        errors.push(`section "${def.label}" is ${def.required ? "required" : "protected"} and cannot be hidden`);
      }
      out.push({
        kind: "section",
        key,
        hidden: hidden && !def.required && !def.locked,
        visibility: pick((entry as { visibility?: unknown }).visibility, VISIBILITIES, "all"),
      });
    } else if ((entry as { kind?: unknown }).kind === "block") {
      const raw = (entry as { block?: unknown }).block as BlockInstance;
      if (!raw || typeof raw !== "object") continue;
      const id = String(raw.id ?? "");
      if (!ID_RE.test(id)) {
        errors.push(`block id "${String(id).slice(0, 20)}" is invalid`);
        continue;
      }
      if (seenIds.has(id)) {
        errors.push(`block id "${id}" is duplicated`);
        continue;
      }
      seenIds.add(id);
      const def = BLOCK_DEF_BY_TYPE.get(String(raw.type));
      if (!def) {
        errors.push(`unknown block type "${String(raw.type).slice(0, 24)}"`);
        continue;
      }
      if (opts.pageKind === "template" && !def.onTemplates) {
        errors.push(`"${def.label}" blocks cannot be inserted into shared templates`);
        continue;
      }
      if (opts.pageKind === "custom" && !def.onCustomPages) {
        errors.push(`"${def.label}" blocks cannot be used on custom pages`);
        continue;
      }
      const settings = sanitizeBlockSettings(def.type, raw.settings, ctx);
      if (settings === null) continue;
      const hidden = raw.hidden === true;
      if (def.type === "hero" && (settings.level ?? "h2") === "h1" && !hidden) h1Count += 1;
      out.push({
        kind: "block",
        block: {
          id,
          type: def.type,
          hidden,
          visibility: pick(raw.visibility, VISIBILITIES, "all"),
          style: sanitizeStyle(raw.style),
          settings,
        },
      });
    } else {
      errors.push("layout entries must be sections or blocks");
    }
  }

  if (!opts.fragment) {
    // required sections can never be dropped — fail loudly, and also fail-safe
    for (const def of sections) {
      if ((def.required || def.locked) && !seenSections.has(def.key)) {
        errors.push(`${def.required ? "required" : "protected"} section "${def.label}" is missing from the layout`);
      }
    }

    // exactly one H1 on a custom page; zero admin-minted H1s on templates
    if (opts.pageKind === "custom") {
      if (h1Count === 0) errors.push("a custom page needs exactly one Hero (H1) block");
      if (h1Count > 1) errors.push(`only one H1 is allowed — found ${h1Count} hero blocks at level h1`);
      const firstVisible = out.find((e) => (e.kind === "block" ? !e.block.hidden : !e.hidden));
      if (firstVisible && firstVisible.kind === "block" && firstVisible.block.type !== "hero" && h1Count > 0) {
        errors.push("the Hero (H1) block must be the first visible block");
      }
    } else if (h1Count > 0) {
      errors.push("template insertions cannot add an H1 — the template owns its H1");
    }
  }

  if (!out.length) errors.push("layout is empty");

  return { ok: errors.length === 0, errors, doc: { type: "layout", blocks: out }, text: ctx.textParts.join("\n").trim() };
}

/* ------------------------------------------------------------ navigation */
export interface NavItem {
  key: string;
  label: string;
  href: string;
  kind: "system" | "page" | "anchor";
  hidden: boolean;
}
export interface NavDoc {
  type: "nav";
  items: NavItem[];
}

/** the code-owned system links — always present, destinations immutable */
export const SYSTEM_NAV: { key: string; label: string; href: string }[] = [
  { key: "map", label: "THE MAP", href: "/#map" },
  { key: "new-builds", label: "NEW BUILDS", href: "/new-builds" },
  { key: "land", label: "LAND", href: "/land" },
  { key: "cities", label: "THE INDEX", href: "/#cities" },
  { key: "about", label: "ABOUT", href: "/#about" },
  { key: "search", label: "SEARCH HOMES", href: "/homes" },
];

export function sanitizeNav(
  input: unknown,
  opts: { publishedPageSlugs: string[] }
): { ok: boolean; errors: string[]; doc?: NavDoc; text: string } {
  const errors: string[] = [];
  const root = input as NavDoc;
  if (!root || root.type !== "nav" || !Array.isArray(root.items)) {
    return { ok: false, errors: ["navigation must be { type:'nav', items:[…] }"], text: "" };
  }
  const systemByKey = new Map(SYSTEM_NAV.map((s) => [s.key, s]));
  const okPages = new Set(opts.publishedPageSlugs.map((s) => "/" + s));
  const out: NavItem[] = [];
  const seenKeys = new Set<string>();
  const visibleHrefs = new Set<string>();

  for (const it of root.items.slice(0, 20)) {
    const key = clean((it as { key?: unknown })?.key, 40).toLowerCase().replace(/\s+/g, "-");
    const label = clean((it as { label?: unknown })?.label, 24).toUpperCase();
    const hidden = (it as { hidden?: unknown })?.hidden === true;
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    const sys = systemByKey.get(key);
    if (sys) {
      // destination is immutable; label editable; SEARCH HOMES cannot hide
      const forcedVisible = key === "search";
      out.push({ key, label: label || sys.label, href: sys.href, kind: "system", hidden: hidden && !forcedVisible });
      if (!(hidden && !forcedVisible)) visibleHrefs.add(sys.href);
      continue;
    }
    const href = String((it as { href?: unknown })?.href ?? "").trim();
    if (/^\/(admin|account|api|auth)(\/|$)/.test(href)) {
      errors.push(`"${label || key}" — admin/account/api/auth routes can never enter public navigation`);
      continue;
    }
    const anchor = /^\/#[a-z0-9-]+$/.test(href);
    const page = okPages.has(href);
    if (!anchor && !page) {
      errors.push(`"${label || key}" — links may only target published builder pages or homepage anchors (got "${href.slice(0, 40)}")`);
      continue;
    }
    if (!label) {
      errors.push(`item "${key}" needs a label`);
      continue;
    }
    if (!hidden && visibleHrefs.has(href)) {
      errors.push(`"${label}" duplicates a destination already in the displayed navigation`);
      continue;
    }
    if (!hidden) visibleHrefs.add(href);
    out.push({ key, label, href, kind: page ? "page" : "anchor", hidden });
  }

  // every system item must survive
  for (const sys of SYSTEM_NAV) {
    if (!out.some((i) => i.key === sys.key)) {
      out.push({ key: sys.key, label: sys.label, href: sys.href, kind: "system", hidden: false });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    doc: { type: "nav", items: out },
    text: out.map((i) => `${i.label} ${i.href}${i.hidden ? " (hidden)" : ""}`).join("\n"),
  };
}

/* ----------------------------------------------------------- page slugs */
export const RESERVED_SLUGS = new Set([
  "admin", "account", "api", "auth", "homes", "land", "new-builds", "how-we-research",
  "city", "listing", "dev", "images", "trec", "sitemap.xml", "robots.txt", "favicon.ico",
  "p", "next", "_next", "index", "null", "undefined",
]);

export function validateSlug(slug: string, taken: string[]): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.push("slug must be lowercase letters, numbers, and single hyphens");
  if (slug.length < 3 || slug.length > 60) errors.push("slug must be 3–60 characters");
  if (RESERVED_SLUGS.has(slug)) errors.push(`"/${slug}" is a reserved route`);
  if (taken.includes(slug)) errors.push(`"/${slug}" already exists`);
  return errors;
}

/* ------------------------------------------------------------- layout diff */
export interface LayoutDiff {
  added: string[];
  removed: string[];
  moved: string[];
  hidden: string[];
  shown: string[];
  edited: string[];
}

const entryKey = (e: LayoutEntry) => (e.kind === "section" ? `section:${e.key}` : `block:${e.block.id}`);

/* key-order-canonical stringify: documents that round-trip through Postgres
   jsonb come back with reordered object keys, and a raw JSON.stringify
   comparison would report every entry as "edited" */
const stableJson = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
};
const entryLabel = (e: LayoutEntry, sections: SectionDef[]) =>
  e.kind === "section"
    ? sections.find((s) => s.key === e.key)?.label ?? e.key
    : `${BLOCK_DEF_BY_TYPE.get(e.block.type)?.label ?? e.block.type} (${e.block.id.slice(0, 8)})`;

export function diffLayouts(prev: LayoutDoc | null, next: LayoutDoc, sections: SectionDef[] = []): LayoutDiff {
  const a = prev?.blocks ?? [];
  const b = next.blocks;
  const aBy = new Map(a.map((e, i) => [entryKey(e), { e, i }]));
  const bBy = new Map(b.map((e, i) => [entryKey(e), { e, i }]));
  const diff: LayoutDiff = { added: [], removed: [], moved: [], hidden: [], shown: [], edited: [] };

  for (const [k, { e, i }] of bBy) {
    const old = aBy.get(k);
    if (!old) {
      diff.added.push(entryLabel(e, sections));
      continue;
    }
    const wasHidden = old.e.kind === "section" ? old.e.hidden : old.e.kind === "block" ? old.e.block.hidden : false;
    const isHidden = e.kind === "section" ? e.hidden : e.block.hidden;
    if (!wasHidden && isHidden) diff.hidden.push(entryLabel(e, sections));
    if (wasHidden && !isHidden) diff.shown.push(entryLabel(e, sections));
    // order comparison against surviving entries only
    if (old.i !== i && a.filter((x) => bBy.has(entryKey(x))).findIndex((x) => entryKey(x) === k) !== b.filter((x) => aBy.has(entryKey(x))).findIndex((x) => entryKey(x) === k)) {
      diff.moved.push(entryLabel(e, sections));
    }
    if (stableJson(old.e) !== stableJson(e) && !(!wasHidden && isHidden) && !(wasHidden && !isHidden)) {
      diff.edited.push(entryLabel(e, sections));
    }
  }
  for (const [k, { e }] of aBy) if (!bBy.has(k)) diff.removed.push(entryLabel(e, sections));
  // de-noise: an entry that moved AND edited reports once each list; fine
  return diff;
}

/** the code-owned identity layout for a template route — what the builder
    shows before any override exists */
export function codeLayout(sectionsKey: string): LayoutDoc {
  const sections = TEMPLATE_SECTIONS[sectionsKey] ?? [];
  return { type: "layout", blocks: sections.map((s) => ({ kind: "section", key: s.key, hidden: false, visibility: "all" })) };
}

/** starter layouts for the New Page templates */
export function starterLayout(template: string, uid: () => string): LayoutDoc {
  const heroBlock = (heading: string, sub: string): LayoutEntry => ({
    kind: "block",
    block: {
      id: uid(), type: "hero", hidden: false, visibility: "all",
      style: { treatment: "parchment", width: "constrained", align: "left", spacing: "lg" },
      settings: { kicker: "DISCOVER DFW", heading, sub, level: "h1", buttons: [] },
    },
  });
  const rich = (text: string): LayoutEntry => ({
    kind: "block",
    block: {
      id: uid(), type: "richtext", hidden: false, visibility: "all",
      style: { treatment: "parchment", width: "constrained", align: "left", spacing: "md" },
      settings: { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } },
    },
  });
  const block = (type: string, settings: Record<string, unknown>, treatment: StyleSettings["treatment"] = "parchment"): LayoutEntry => ({
    kind: "block",
    block: { id: uid(), type, hidden: false, visibility: "all", style: { treatment, width: "constrained", align: "left", spacing: "md" }, settings },
  });

  switch (template) {
    case "landing":
      return { type: "layout", blocks: [heroBlock("A headline that earns the click.", "One supporting sentence that says who this is for."), rich("Write the pitch here."), block("cta", { kicker: "NEXT STEP", heading: "Ready when you are.", body: "", buttons: [{ label: "Search homes", href: "/homes", style: "primary" }] }, "ink"), block("leadForm", { heading: "Talk to a local guide", primary: "ask-a-question" })] };
    case "buyer-guide":
      return { type: "layout", blocks: [heroBlock("The Discover DFW buyer guide.", "What to know before you write an offer in North Texas."), rich("Start with the big picture…"), block("faq", { items: [{ q: "How do we start?", a: "Tell us what matters and we'll narrow the map." }] }), block("searchPromo", { heading: "See what's on the market", body: "", target: "/homes", buttonLabel: "Open the search" }, "ink")] };
    case "seller-guide":
      return { type: "layout", blocks: [heroBlock("The Discover DFW seller guide.", "Pricing, prep, and timing for North Texas sellers."), rich("What your home is worth starts with…"), block("leadForm", { heading: "Get a straight answer on value", primary: "ask-a-question" })] };
    case "about-team":
      return { type: "layout", blocks: [heroBlock("The people behind the field guide.", "We walk the blocks, drive the commutes, and read the tax rates."), rich("Introduce the team here."), block("quote", { text: "We walk the blocks, drive the commutes, and read the tax rates so your shortlist is actually short.", cite: "Discover DFW" })] };
    case "contact":
      return { type: "layout", blocks: [heroBlock("Talk to Discover DFW.", "A person reads every message."), block("leadForm", { heading: "Send a note", primary: "ask-a-question" })] };
    case "listings-landing":
      return { type: "layout", blocks: [heroBlock("Homes worth your weekend.", "A live look at the market, curated the field-guide way."), block("featuredListings", { heading: "Fresh on the market", citySlug: "", maxPrice: "", count: "3", newBuildsOnly: false }), block("searchPromo", { heading: "Search every active listing", body: "", target: "/homes", buttonLabel: "Open the map room" }, "ink")] };
    default:
      return { type: "layout", blocks: [heroBlock("New page.", "Say what this page is for."), rich("Write here.")] };
  }
}
