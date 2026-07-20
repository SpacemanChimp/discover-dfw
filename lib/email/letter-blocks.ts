/* The Letter — block-based issue model (visual editor upgrade). PURE: no
   React, no server imports, no database — everything the editor can save
   is validated HERE against a closed world, and the same block document
   renders BOTH the responsive email HTML and the plain-text alternative.
   Tested by scripts/tests/letter-blocks.test.mjs.

   Contract with the existing system (audited before building):
   · letter_issues.sections_json is untyped jsonb — a block document
     ({type:"letter", …}) coexists with the legacy flat shape
     ({editorsNote, communityOfWeek}) with NO migration; the previously
     SENT issue keeps its legacy shape and its legacy renderer forever.
   · stats_json stays the single canonical source of market numbers: the
     week-in-numbers and market-movers blocks are PLACEMENT MARKERS that
     render from the frozen, dated NTREIS stats — the editor can move or
     hide them but never type numbers into them.
   · The compliance footer is NOT a removable block: the renderer ALWAYS
     appends the Discover DFW identity, the postal address, and the
     per-recipient %%UNSUB_URL%% unsubscribe link after every document,
     and the sanitizer refuses documents that try to smuggle a footer
     block anywhere else.
   · Every text-bearing block passes the risky-claims screen
     (lib/editor/doc.ts validateClaims) before READY/SEND — the same
     rules the site's publish gates enforce. */

import { sanitizeRichDoc, validateClaims, isAllowedImageSrc, type PMNode } from "../editor/doc.ts";
import { SITE_URL } from "../site.ts";
import type { IssueStats, IssueSections } from "./letter-issue.ts";

export const UNSUB_PLACEHOLDER = "%%UNSUB_URL%%";
export const LETTER_POSTAL_ADDRESS = "2201 Spinks Rd. #248, Flower Mound, Texas 75022";

/* ------------------------------------------------------------- types */

export type LetterBlock =
  | { id: string; type: "masthead" }
  | { id: string; type: "editors-note"; doc: PMNode }
  | { id: string; type: "heading"; text: string; level: 2 | 3 }
  | { id: string; type: "richtext"; doc: PMNode }
  | { id: string; type: "image"; src: string; alt: string; caption: string; attribution: string; href: string }
  | { id: string; type: "stat-strip"; items: { value: string; label: string }[]; note: string }
  | { id: string; type: "week-in-numbers" }
  | { id: string; type: "market-movers"; count: 3 | 5 }
  | { id: string; type: "community-spotlight"; citySlug: string; hoodSlug: string; name: string; blurb: string }
  | { id: string; type: "listing-spotlight"; listingKey: string; headline: string; note: string }
  | { id: string; type: "cta"; label: string; href: string }
  | { id: string; type: "divider" }
  | { id: string; type: "spacer"; size: "sm" | "md" | "lg" }
  | { id: string; type: "social" };

export interface LetterDoc {
  type: "letter";
  /** inbox preview line under the subject */
  preheader: string;
  blocks: (LetterBlock & { hidden?: boolean })[];
}

export const LETTER_BLOCK_TYPES = [
  "masthead", "editors-note", "heading", "richtext", "image", "stat-strip",
  "week-in-numbers", "market-movers", "community-spotlight", "listing-spotlight",
  "cta", "divider", "spacer", "social",
] as const;

export const LETTER_BLOCK_LABELS: Record<string, string> = {
  masthead: "Masthead",
  "editors-note": "Editor's note",
  heading: "Heading",
  richtext: "Rich text",
  image: "Image",
  "stat-strip": "Stat strip (editorial)",
  "week-in-numbers": "Week in numbers (NTREIS)",
  "market-movers": "Market movers (NTREIS)",
  "community-spotlight": "Community spotlight",
  "listing-spotlight": "Listing spotlight",
  cta: "CTA button",
  divider: "Divider",
  spacer: "Spacer",
  social: "Site & contact links",
};

/** blocks whose content is code-owned (placement only in the editor) */
export const LOCKED_CONTENT_TYPES = new Set(["masthead", "week-in-numbers", "market-movers", "social", "divider"]);

export function isLetterDoc(v: unknown): v is LetterDoc {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "letter" && Array.isArray((v as { blocks?: unknown }).blocks);
}

/* --------------------------------------------------- legacy conversion */

const emptyRich = (): PMNode => ({ type: "doc", content: [] });
const textRich = (text: string): PMNode => ({
  type: "doc",
  content: text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })),
});

/** the default document a freshly generated issue starts from — the note
    carries a starter line (the lint's 120-char editorial floor still keeps
    a stub from reaching READY) */
export function defaultLetterDoc(): LetterDoc {
  return {
    type: "letter",
    preheader: "",
    blocks: [
      { id: "blk-masthead", type: "masthead" },
      { id: "blk-note", type: "editors-note", doc: textRich("Write this week's note here.") },
      { id: "blk-numbers", type: "week-in-numbers" },
      { id: "blk-movers", type: "market-movers", count: 5 },
    ],
  };
}

/** read-side upgrade for pre-block drafts — pure, never written back to a
    SENT issue (the caller only persists conversions of draft/ready rows) */
export function letterDocFromLegacy(sections: IssueSections | null | undefined): LetterDoc {
  const doc = defaultLetterDoc();
  if (!sections) return doc;
  if (sections.editorsNote?.trim()) {
    doc.blocks = doc.blocks.map((b) => (b.type === "editors-note" ? { ...b, doc: textRich(sections.editorsNote) } : b));
  }
  if (sections.communityOfWeek) {
    const c = sections.communityOfWeek;
    doc.blocks.push({ id: "blk-cow", type: "community-spotlight", citySlug: c.citySlug, hoodSlug: c.hoodSlug, name: c.name, blurb: c.blurb });
  }
  return doc;
}

/* ------------------------------------------------------------ sanitize */

const clean = (v: unknown, max: number): string =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const SLUG_RE = /^[a-z0-9-]{2,60}$/;
const LISTING_RE = /^[A-Za-z0-9_-]{4,40}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;

/** email CTA/link destinations: internal paths only (rendered absolute
    with SITE_URL) — no external URLs, no schemes, no admin/api routes */
export function isAllowedLetterHref(href: string): boolean {
  if (!href.startsWith("/")) return false;
  if (/^\/(admin|api|account|auth)(\/|$)/.test(href)) return false;
  if (/[\s<>"']/.test(href) || href.length > 200) return false;
  return true;
}

export interface LetterSanitizeResult {
  ok: boolean;
  errors: string[];
  doc?: LetterDoc;
  /** every human-readable string, for the claims/lint screens */
  text: string;
}

export const MAX_LETTER_BLOCKS = 30;

export function sanitizeLetterDoc(input: unknown, opts?: { supabaseUrl?: string }): LetterSanitizeResult {
  const errors: string[] = [];
  const textParts: string[] = [];
  if (!isLetterDoc(input)) return { ok: false, errors: ["letter document must be { type:'letter', blocks:[…] }"], text: "" };
  if (JSON.stringify(input).length > 300_000) return { ok: false, errors: ["letter document is too large"], text: "" };
  if (/<\s*script|javascript:|onerror\s*=|onload\s*=|<\s*iframe|<\s*form/i.test(JSON.stringify(input))) {
    errors.push("script/iframe/form-shaped content is not allowed in email");
  }

  const preheader = clean((input as LetterDoc).preheader, 140);
  if (preheader) textParts.push(preheader);

  const out: LetterDoc["blocks"] = [];
  const seenIds = new Set<string>();
  const seenSingletons = new Set<string>();
  const richOpts = { allowImages: false, supabaseUrl: opts?.supabaseUrl, requireImageAlt: true };

  for (const raw of (input as LetterDoc).blocks.slice(0, MAX_LETTER_BLOCKS)) {
    const b = raw as LetterBlock & { hidden?: unknown };
    const id = String((b as { id?: unknown }).id ?? "");
    if (!ID_RE.test(id) || seenIds.has(id)) {
      errors.push(`block id "${id.slice(0, 20)}" is invalid or duplicated`);
      continue;
    }
    seenIds.add(id);
    const hidden = b.hidden === true;

    switch (b.type) {
      case "masthead":
      case "week-in-numbers":
      case "social": {
        if (seenSingletons.has(b.type)) {
          errors.push(`only one ${b.type} block is allowed`);
          continue;
        }
        seenSingletons.add(b.type);
        out.push({ id, type: b.type, ...(hidden && b.type !== "masthead" ? { hidden } : {}) });
        if (hidden && b.type === "masthead") errors.push("the masthead cannot be hidden — the letter must identify its sender");
        break;
      }
      case "market-movers": {
        if (seenSingletons.has(b.type)) {
          errors.push("only one market-movers block is allowed");
          continue;
        }
        seenSingletons.add(b.type);
        out.push({ id, type: "market-movers", count: b.count === 3 ? 3 : 5, ...(hidden ? { hidden } : {}) });
        break;
      }
      case "editors-note":
      case "richtext": {
        const r = sanitizeRichDoc((b as { doc?: unknown }).doc, richOpts);
        if (!r.ok) {
          errors.push(...r.errors.map((e) => `${b.type}: ${e}`));
          continue;
        }
        textParts.push(r.text);
        out.push({ id, type: b.type, doc: r.doc as PMNode, ...(hidden ? { hidden } : {}) });
        break;
      }
      case "heading": {
        const text = clean((b as { text?: unknown }).text, 120);
        if (!text) {
          errors.push("heading: text is required");
          continue;
        }
        textParts.push(text);
        out.push({ id, type: "heading", text, level: (b as { level?: unknown }).level === 3 ? 3 : 2, ...(hidden ? { hidden } : {}) });
        break;
      }
      case "image": {
        const src = String((b as { src?: unknown }).src ?? "").trim();
        if (!isAllowedImageSrc(src, opts?.supabaseUrl)) {
          errors.push("image: src must be an approved editorial asset (no remote hotlinks)");
          continue;
        }
        const alt = clean((b as { alt?: unknown }).alt, 300);
        const attribution = clean((b as { attribution?: unknown }).attribution, 160);
        if (!alt) errors.push("image: alt text is required");
        if (!attribution) errors.push("image: attribution is required");
        const href = String((b as { href?: unknown }).href ?? "").trim();
        if (href && !isAllowedLetterHref(href)) errors.push("image: link must be an internal path");
        const caption = clean((b as { caption?: unknown }).caption, 200);
        textParts.push(caption);
        out.push({ id, type: "image", src, alt, caption, attribution, href: href && isAllowedLetterHref(href) ? href : "", ...(hidden ? { hidden } : {}) });
        break;
      }
      case "stat-strip": {
        const items = (Array.isArray((b as { items?: unknown }).items) ? ((b as { items: unknown[] }).items as unknown[]) : [])
          .slice(0, 4)
          .map((it) => ({ value: clean((it as { value?: unknown })?.value, 20), label: clean((it as { label?: unknown })?.label, 60) }))
          .filter((it) => it.value && it.label);
        if (!items.length) {
          errors.push("stat-strip: at least one value+label pair is required");
          continue;
        }
        const note = clean((b as { note?: unknown }).note, 160);
        items.forEach((it) => textParts.push(`${it.value} ${it.label}`));
        textParts.push(note);
        out.push({ id, type: "stat-strip", items, note, ...(hidden ? { hidden } : {}) });
        break;
      }
      case "community-spotlight": {
        const citySlug = String((b as { citySlug?: unknown }).citySlug ?? "");
        const hoodSlug = String((b as { hoodSlug?: unknown }).hoodSlug ?? "");
        if (!SLUG_RE.test(citySlug) || !SLUG_RE.test(hoodSlug)) {
          errors.push("community-spotlight: pick a community");
          continue;
        }
        const name = clean((b as { name?: unknown }).name, 80);
        const blurb = clean((b as { blurb?: unknown }).blurb, 400);
        if (!blurb) errors.push("community-spotlight: a blurb is required");
        textParts.push(`${name} ${blurb}`);
        out.push({ id, type: "community-spotlight", citySlug, hoodSlug, name, blurb, ...(hidden ? { hidden } : {}) });
        break;
      }
      case "listing-spotlight": {
        const listingKey = String((b as { listingKey?: unknown }).listingKey ?? "");
        if (!LISTING_RE.test(listingKey)) {
          errors.push("listing-spotlight: a listing key is required");
          continue;
        }
        const headline = clean((b as { headline?: unknown }).headline, 120);
        const note = clean((b as { note?: unknown }).note, 300);
        if (!headline) errors.push("listing-spotlight: a headline is required");
        textParts.push(`${headline} ${note}`);
        out.push({ id, type: "listing-spotlight", listingKey, headline, note, ...(hidden ? { hidden } : {}) });
        break;
      }
      case "cta": {
        const label = clean((b as { label?: unknown }).label, 40);
        const href = String((b as { href?: unknown }).href ?? "").trim();
        if (!label) errors.push("cta: a label is required");
        if (!isAllowedLetterHref(href)) {
          errors.push(`cta: "${href.slice(0, 40)}" is not an allowed destination — internal paths only`);
          continue;
        }
        textParts.push(label);
        out.push({ id, type: "cta", label, href, ...(hidden ? { hidden } : {}) });
        break;
      }
      case "divider":
        out.push({ id, type: "divider", ...(hidden ? { hidden } : {}) });
        break;
      case "spacer": {
        const size = (b as { size?: unknown }).size;
        out.push({ id, type: "spacer", size: size === "sm" || size === "lg" ? size : "md", ...(hidden ? { hidden } : {}) });
        break;
      }
      default:
        errors.push(`unknown block type "${String((b as { type?: unknown }).type).slice(0, 24)}" — the footer is code-owned and cannot appear as a block`);
    }
  }

  // masthead is required and always FIRST — the letter identifies itself
  const mastIdx = out.findIndex((b) => b.type === "masthead");
  if (mastIdx < 0) errors.push("the masthead is required");
  else if (mastIdx > 0) out.unshift(out.splice(mastIdx, 1)[0]);
  if (!out.some((b) => !("hidden" in b && b.hidden) && !LOCKED_CONTENT_TYPES.has(b.type))) {
    errors.push("the letter needs at least one visible content block");
  }

  return { ok: errors.length === 0, errors, doc: { type: "letter", preheader, blocks: out }, text: textParts.filter(Boolean).join("\n") };
}

/* ---------------------------------------------------------------- lint */

export interface LetterLint {
  errors: string[];
  warnings: string[];
}

/** READY/SEND gate: structural sanitation + the risky-claims screen +
    the quality bars the flat editor enforced */
export function lintLetterDoc(subject: string | null | undefined, input: unknown, opts?: { supabaseUrl?: string }): LetterLint {
  const errors: string[] = [];
  const warnings: string[] = [];
  const s = sanitizeLetterDoc(input, opts);
  errors.push(...s.errors);
  const subj = (subject ?? "").trim();
  if (!subj) errors.push("subject is required");
  if (subj.length >= 80) errors.push(`subject is ${subj.length} chars — keep it under 80`);
  if (s.doc) {
    errors.push(...validateClaims(`${subj}\n${s.text}`));
    const editorial = s.text.length;
    if (editorial < 120) errors.push(`editorial text is ${editorial} chars — write at least 120 (a letter, not a stub)`);
    if (!s.doc.preheader) warnings.push("no preheader set — inboxes will preview the first body text");
    if (!s.doc.blocks.some((b) => b.type === "week-in-numbers" && !b.hidden)) warnings.push("the week-in-numbers block is hidden or missing — subscribers expect the numbers");
  }
  return { errors, warnings };
}

/* -------------------------------------------------------------- render */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const abs = (href: string) => `${SITE_URL}${href}`;

const MONO = "font-family:Menlo,Consolas,monospace;";
const KICKER = `${MONO}font-size:10px;font-weight:bold;letter-spacing:.2em;color:#D9481F;`;

/** ProseMirror doc → email-safe inline-styled HTML (paragraphs, h2/h3,
    bold, italic, links, bullet + numbered lists — the sanitized subset) */
export function richToEmailHtml(doc: PMNode): string {
  const inline = (nodes: PMNode[] | undefined): string =>
    (nodes ?? [])
      .map((n) => {
        if (n.type === "hardBreak") return "<br/>";
        if (n.type !== "text") return "";
        let t = esc(String((n as { text?: string }).text ?? ""));
        for (const m of n.marks ?? []) {
          if (m.type === "bold") t = `<strong>${t}</strong>`;
          if (m.type === "italic") t = `<em>${t}</em>`;
          if (m.type === "link") {
            const href = String((m.attrs as { href?: string } | undefined)?.href ?? "");
            if (href) t = `<a href="${esc(href.startsWith("/") ? abs(href) : href)}" style="color:#D9481F;">${t}</a>`;
          }
        }
        return t;
      })
      .join("");
  const blockOut = (n: PMNode): string => {
    switch (n.type) {
      case "paragraph":
        return `<p style="font-size:15px;line-height:1.75;color:rgba(29,25,19,.82);margin:0 0 12px;">${inline(n.content)}</p>`;
      case "heading": {
        const lvl = (n.attrs as { level?: number } | undefined)?.level === 3 ? 3 : 2;
        return `<h${lvl} style="font-size:${lvl === 2 ? 19 : 16}px;font-weight:800;color:#1D1913;margin:16px 0 8px;">${inline(n.content)}</h${lvl}>`;
      }
      case "bulletList":
      case "orderedList": {
        const tag = n.type === "bulletList" ? "ul" : "ol";
        const items = (n.content ?? [])
          .map((li) => `<li style="font-size:15px;line-height:1.7;color:rgba(29,25,19,.82);margin:0 0 6px;">${(li.content ?? []).map(blockOut).join("")}</li>`)
          .join("");
        return `<${tag} style="margin:0 0 12px;padding-left:22px;">${items}</${tag}>`;
      }
      case "blockquote":
        return `<blockquote style="margin:0 0 12px;padding-left:14px;border-left:3px solid #D9481F;">${(n.content ?? []).map(blockOut).join("")}</blockquote>`;
      default:
        return (n.content ?? []).map(blockOut).join("");
    }
  };
  return (doc.content ?? []).map(blockOut).join("");
}

export function richToPlainText(doc: PMNode): string {
  const walk = (n: PMNode): string => {
    if (n.type === "text") return String((n as { text?: string }).text ?? "");
    if (n.type === "hardBreak") return "\n";
    const inner = (n.content ?? []).map(walk).join("");
    if (n.type === "paragraph" || n.type === "heading") return inner + "\n\n";
    if (n.type === "listItem") return "• " + inner.trim() + "\n";
    if (n.type === "bulletList" || n.type === "orderedList") return inner + "\n";
    return inner;
  };
  return walk(doc).replace(/\n{3,}/g, "\n\n").trim();
}

const card = (inner: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EE;border:2px solid #1D1913;border-radius:16px;border-collapse:separate;overflow:hidden;margin-bottom:18px;">${inner}</table>`;

/** Render a block document + frozen stats into the full email. The
    compliance footer is appended by THIS function unconditionally — no
    document shape can omit it. */
export function renderLetterEmail(opts: {
  issueDate: string;
  subject: string;
  doc: LetterDoc;
  stats: IssueStats | null;
  isTest?: boolean;
}): { subject: string; html: string; text: string } {
  const { issueDate, subject, doc, stats, isTest } = opts;
  const dateLabel = new Date(issueDate + "T12:00:00Z")
    .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .toUpperCase();

  const html: string[] = [];
  const text: string[] = [];
  text.push(`DISCOVER DFW — THE LETTER · ${dateLabel}`, subject.toUpperCase(), "");

  for (const b of doc.blocks) {
    if ((b as { hidden?: boolean }).hidden) continue;
    switch (b.type) {
      case "masthead":
        html.push(
          `<div style="${KICKER}font-size:10px;letter-spacing:.26em;text-align:center;">DISCOVER DFW — THE LETTER · ${dateLabel}</div>`,
          `<h1 style="font-size:26px;font-weight:900;color:#1D1913;text-align:center;margin:10px 0 16px;">${esc(subject)}</h1>`
        );
        break;
      case "editors-note":
      case "richtext": {
        const inner = richToEmailHtml(b.doc);
        if (inner) {
          html.push(`<div style="margin-bottom:18px;">${inner}</div>`);
          text.push(richToPlainText(b.doc), "");
        }
        break;
      }
      case "heading":
        html.push(`<h2 style="font-size:${b.level === 2 ? 20 : 17}px;font-weight:800;color:#1D1913;margin:18px 0 10px;">${esc(b.text)}</h2>`);
        text.push(b.text.toUpperCase(), "");
        break;
      case "image": {
        const img = `<img src="${esc(b.src)}" alt="${esc(b.alt)}" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:2px solid #1D1913;border-radius:12px;" />`;
        html.push(
          `<div style="margin-bottom:6px;">${b.href ? `<a href="${esc(abs(b.href))}">${img}</a>` : img}</div>`,
          `<div style="${MONO}font-size:9px;letter-spacing:.12em;color:rgba(29,25,19,.55);margin-bottom:14px;">${esc([b.caption, b.attribution].filter(Boolean).join(" · ").toUpperCase())}</div>`
        );
        if (b.caption) text.push(`[Photo: ${b.caption} — ${b.attribution}]`, "");
        break;
      }
      case "stat-strip": {
        const cells = b.items
          .map(
            (it) =>
              `<td align="center" style="padding:12px 8px;"><div style="font-size:22px;font-weight:900;color:#D9481F;">${esc(it.value)}</div><div style="${MONO}font-size:9px;letter-spacing:.14em;color:rgba(29,25,19,.6);margin-top:2px;">${esc(it.label.toUpperCase())}</div></td>`
          )
          .join("");
        html.push(card(`<tr>${cells}</tr>${b.note ? `<tr><td colspan="${b.items.length}" style="padding:0 14px 10px;${MONO}font-size:9px;letter-spacing:.12em;color:rgba(29,25,19,.5);text-align:center;">${esc(b.note.toUpperCase())}</td></tr>` : ""}`));
        text.push(...b.items.map((it) => `${it.value} — ${it.label}`), "");
        break;
      }
      case "week-in-numbers": {
        if (!stats) break;
        html.push(
          card(
            `<tr><td style="padding:14px 18px;"><div style="${KICKER}">THE WEEK IN NUMBERS</div><div style="font-size:15px;color:#1D1913;margin-top:6px;"><strong>${stats.metro.actives.toLocaleString("en-US")}</strong> homes on the market metro-wide · <strong>${stats.metro.new7d.toLocaleString("en-US")}</strong> listed in the last 7 days</div><div style="${MONO}font-size:9px;letter-spacing:.14em;color:rgba(29,25,19,.55);margin-top:4px;">LIVE NTREIS DATA · MLS-MATCHED COUNTS</div></td></tr>`
          )
        );
        text.push("THE WEEK IN NUMBERS", `${stats.metro.actives.toLocaleString("en-US")} homes on the market metro-wide · ${stats.metro.new7d.toLocaleString("en-US")} listed in the last 7 days`, "(Live NTREIS data, MLS-matched counts)", "");
        break;
      }
      case "market-movers": {
        if (!stats) break;
        const movers = [...stats.cities].sort((x, y) => y.new7d - x.new7d).slice(0, b.count);
        const rows = movers
          .map((c) => {
            const delta = c.median != null && c.medianPrev != null && c.medianPrev !== 0 ? ((c.median - c.medianPrev) / c.medianPrev) * 100 : null;
            // DELTA GUARD (ported): |Δ| > 10%/wk is a data artifact, not news
            const deltaLabel = delta == null || Math.abs(delta) > 10 ? "" : ` · MEDIAN ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% WK`;
            text.push(`${c.name}: ${c.new7d} new this week · ${c.actives} active${c.median != null ? ` · median ${money(c.median)}` : ""}`);
            return `<tr><td style="padding:10px 18px;border-bottom:1px solid rgba(29,25,19,.14);"><div style="font-size:15px;font-weight:600;color:#1D1913;"><a href="${SITE_URL}/city/${c.slug}" style="color:#1D1913;text-decoration:none;">${esc(c.name)}</a></div><div style="${MONO}font-size:10px;letter-spacing:.14em;color:rgba(29,25,19,.6);margin-top:2px;">${c.new7d} NEW THIS WEEK · ${c.actives} ACTIVE${c.median != null ? ` · MEDIAN ${money(c.median)}` : ""}${esc(deltaLabel)}</div></td></tr>`;
          })
          .join("");
        html.push(card(`<tr><td style="padding:10px 18px 4px;"><div style="${KICKER}">CITIES THAT CHANGED THEIR MATH</div></td></tr>${rows}`));
        text.push("");
        break;
      }
      case "community-spotlight":
        html.push(
          card(
            `<tr><td style="padding:16px 18px;"><div style="${KICKER}">COMMUNITY SPOTLIGHT</div><div style="font-size:17px;font-weight:700;color:#1D1913;margin-top:6px;">${esc(b.name)}</div><p style="font-size:14px;line-height:1.7;color:rgba(29,25,19,.78);margin:6px 0 12px;">${esc(b.blurb)}</p><a href="${SITE_URL}/city/${b.citySlug}/${b.hoodSlug}" style="display:inline-block;background:#D9481F;color:#F6F1E6;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;text-decoration:none;border-radius:999px;padding:11px 22px;">Read the field guide</a></td></tr>`
          )
        );
        text.push(`COMMUNITY SPOTLIGHT: ${b.name}`, b.blurb, `${SITE_URL}/city/${b.citySlug}/${b.hoodSlug}`, "");
        break;
      case "listing-spotlight":
        html.push(
          card(
            `<tr><td style="padding:16px 18px;"><div style="${KICKER}">WORTH A LOOK</div><div style="font-size:17px;font-weight:700;color:#1D1913;margin-top:6px;">${esc(b.headline)}</div>${b.note ? `<p style="font-size:14px;line-height:1.7;color:rgba(29,25,19,.78);margin:6px 0 12px;">${esc(b.note)}</p>` : ""}<a href="${SITE_URL}/listing/${esc(b.listingKey)}" style="display:inline-block;background:#D9481F;color:#F6F1E6;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;text-decoration:none;border-radius:999px;padding:11px 22px;">See the listing</a></td></tr>`
          )
        );
        text.push(`WORTH A LOOK: ${b.headline}`, b.note, `${SITE_URL}/listing/${b.listingKey}`, "");
        break;
      case "cta":
        html.push(
          `<div style="text-align:center;margin:6px 0 18px;"><a href="${esc(abs(b.href))}" style="display:inline-block;background:#D9481F;color:#F6F1E6;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;border-radius:999px;padding:12px 26px;">${esc(b.label)}</a></div>`
        );
        text.push(`${b.label}: ${abs(b.href)}`, "");
        break;
      case "divider":
        html.push(`<div style="border-top:2px solid #1D1913;margin:18px 0;"></div>`);
        text.push("— — —", "");
        break;
      case "spacer":
        html.push(`<div style="height:${b.size === "sm" ? 10 : b.size === "lg" ? 36 : 20}px;line-height:0;">&nbsp;</div>`);
        break;
      case "social":
        html.push(
          `<div style="text-align:center;margin:6px 0 14px;${MONO}font-size:10px;letter-spacing:.16em;"><a href="${SITE_URL}" style="color:#D9481F;">DISCOVERDFW.COM</a> · <a href="${SITE_URL}/homes" style="color:#D9481F;">SEARCH HOMES</a> · <a href="${SITE_URL}/how-we-research" style="color:#D9481F;">HOW WE RESEARCH</a></div>`
        );
        text.push(`${SITE_URL} · ${SITE_URL}/homes · ${SITE_URL}/how-we-research`, "");
        break;
    }
  }

  /* the compliance footer — appended by construction, never a block */
  html.push(
    `<div style="${MONO}font-size:9px;letter-spacing:.14em;color:rgba(29,25,19,.5);text-align:center;margin-top:16px;line-height:2;">YOU'RE GETTING THE LETTER BECAUSE YOU CONFIRMED YOUR SUBSCRIPTION AT DISCOVERDFW.COM.<br/><a href="${UNSUB_PLACEHOLDER}" style="color:rgba(29,25,19,.6);">UNSUBSCRIBE</a> ANY TIME — ONE CLICK, NO QUESTIONS.<br/>DISCOVER DFW · ${LETTER_POSTAL_ADDRESS.toUpperCase()}</div>`
  );
  text.push("", "You're getting The Letter because you confirmed your subscription at discoverdfw.com.", `Unsubscribe any time: ${UNSUB_PLACEHOLDER}`, `Discover DFW · ${LETTER_POSTAL_ADDRESS}`);

  const shell = `
  <div style="background:#F6F1E6;padding:28px 12px;font-family:Georgia,serif;">
    <div style="max-width:520px;margin:0 auto;">
      ${doc.preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(doc.preheader)}</div>` : ""}
      ${isTest ? `<div style="background:#D9481F;color:#F6F1E6;${MONO}font-size:10px;font-weight:bold;letter-spacing:.2em;text-align:center;padding:8px;">TEST COPY — NOT A SUBSCRIBER SEND</div>` : ""}
      ${html.join("\n")}
    </div>
  </div>`;

  return { subject, html: shell, text: text.join("\n").replace(/\n{3,}/g, "\n\n").trim() };
}
