/* Editor document sanitation + validation — PURE and self-contained (no
   React, no server imports, no TipTap) so the server revalidates every
   document independently of the client editor, and node --test can cover
   it directly (scripts/tests/editor-core.test.mjs).

   The stored format is structured JSON (ProseMirror/TipTap document shape
   for richtext; small typed objects for text/faq). Raw HTML never enters
   the store: unknown node types, marks, attributes, protocols, and
   anything script-shaped is rejected — client validation is advisory,
   THIS module is the contract. */

export type ContentType = "richtext" | "text" | "faq";

export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

export interface SanitizeResult {
  ok: boolean;
  errors: string[];
  /** normalized document (only when ok) */
  doc?: PMNode;
  /** plain text extraction for auditing/search */
  text: string;
}

/* ---- limits ---- */
export const MAX_DOC_BYTES = 200_000;
export const MAX_TEXT_CHARS = 20_000;
export const MAX_FAQ_ITEMS = 12;
export const SEO_TITLE_MIN = 15;
export const SEO_TITLE_MAX = 70;
export const SEO_DESC_MIN = 50;
export const SEO_DESC_MAX = 165;

const ALLOWED_MARKS = new Set(["bold", "italic", "link"]);
const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
  "image",
]);

/** hosts/prefixes an inline image src may use — our storage bucket or a
    site-relative /images path. Anything else (hotlinks) is refused. */
export function isAllowedImageSrc(src: string, supabaseUrl: string | undefined): boolean {
  if (typeof src !== "string" || !src) return false;
  if (/^\/images\//.test(src)) return true;
  if (!supabaseUrl) return false;
  const prefix = supabaseUrl.replace(/\/+$/, "") + "/storage/v1/object/public/editorial-photos/";
  return src.startsWith(prefix);
}

/** links: https/http or site-relative path only — never javascript:, data:,
    vbscript:, file:, or protocol-relative //host tricks. */
export function isAllowedLinkHref(href: string): boolean {
  if (typeof href !== "string" || !href.trim()) return false;
  const v = href.trim();
  if (/^https?:\/\//i.test(v)) return true;
  if (v.startsWith("//")) return false;
  if (v.startsWith("/")) return true;
  if (v.startsWith("#")) return true;
  return false;
}

function cleanText(s: string): string {
  // strip control chars (incl. NUL) except newline/tab; collapse nothing else
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/* ---------------------------------------------------------------------- */
/* richtext sanitize: walk the ProseMirror JSON against a strict allowlist */
/* ---------------------------------------------------------------------- */
export function sanitizeRichDoc(
  input: unknown,
  opts: { allowImages: boolean; supabaseUrl?: string; requireImageAlt?: boolean }
): SanitizeResult {
  const errors: string[] = [];
  const textParts: string[] = [];

  if (typeof input === "string") {
    errors.push("document must be structured JSON, not a string");
    return { ok: false, errors, text: "" };
  }
  const root = input as PMNode;
  if (!root || typeof root !== "object" || root.type !== "doc" || !Array.isArray(root.content)) {
    errors.push("document root must be a { type:'doc', content:[…] } object");
    return { ok: false, errors, text: "" };
  }

  const serialized = JSON.stringify(input);
  if (serialized.length > MAX_DOC_BYTES) {
    errors.push(`document is too large (${serialized.length} bytes; limit ${MAX_DOC_BYTES})`);
    return { ok: false, errors, text: "" };
  }
  if (/<\s*script|javascript:|onerror\s*=|onload\s*=/i.test(serialized)) {
    errors.push("script-shaped content is not allowed");
  }

  function sanitizeMarks(marks: PMNode["marks"], where: string) {
    const out: NonNullable<PMNode["marks"]> = [];
    for (const m of marks ?? []) {
      if (!m || typeof m.type !== "string" || !ALLOWED_MARKS.has(m.type)) {
        errors.push(`mark "${m?.type ?? "?"}" is not allowed (${where})`);
        continue;
      }
      if (m.type === "link") {
        const href = String(m.attrs?.href ?? "");
        if (!isAllowedLinkHref(href)) {
          errors.push(`link href "${href.slice(0, 60)}" uses an unsupported protocol (${where})`);
          continue;
        }
        const external = /^https?:\/\//i.test(href);
        out.push({ type: "link", attrs: { href, ...(external ? { rel: "noopener noreferrer", target: "_blank" } : {}) } });
      } else {
        out.push({ type: m.type });
      }
    }
    return out;
  }

  function sanitizeInline(nodes: PMNode[] | undefined, where: string): PMNode[] {
    const out: PMNode[] = [];
    for (const n of nodes ?? []) {
      if (!n || typeof n.type !== "string") continue;
      if (n.type === "text") {
        const t = cleanText(String(n.text ?? ""));
        if (!t) continue;
        textParts.push(t);
        out.push({ type: "text", text: t, marks: sanitizeMarks(n.marks, where) });
      } else if (n.type === "hardBreak") {
        out.push({ type: "hardBreak" });
      } else {
        errors.push(`inline node "${n.type}" is not allowed (${where})`);
      }
    }
    return out;
  }

  function sanitizeBlock(n: PMNode, depth: number): PMNode | null {
    if (!n || typeof n.type !== "string") return null;
    if (depth > 6) {
      errors.push("document nests too deeply");
      return null;
    }
    switch (n.type) {
      case "paragraph": {
        const content = sanitizeInline(n.content, "paragraph");
        textParts.push("\n");
        return { type: "paragraph", content };
      }
      case "heading": {
        const level = Number(n.attrs?.level ?? 0);
        if (level === 1) {
          errors.push("H1 is not allowed inside editable content — the page owns its H1");
          return null;
        }
        if (level !== 2 && level !== 3) {
          errors.push(`heading level ${level} is not allowed (H2/H3 only)`);
          return null;
        }
        const content = sanitizeInline(n.content, `h${level}`);
        textParts.push("\n");
        return { type: "heading", attrs: { level }, content };
      }
      case "bulletList":
      case "orderedList": {
        const items: PMNode[] = [];
        for (const li of n.content ?? []) {
          if (li?.type !== "listItem") {
            errors.push(`"${li?.type}" is not allowed inside a list`);
            continue;
          }
          const inner: PMNode[] = [];
          for (const c of li.content ?? []) {
            const s = sanitizeBlock(c, depth + 1);
            if (s && (s.type === "paragraph" || s.type === "bulletList" || s.type === "orderedList")) inner.push(s);
            else if (s) errors.push(`"${s.type}" is not allowed inside a list item`);
          }
          items.push({ type: "listItem", content: inner });
        }
        return { type: n.type, content: items };
      }
      case "blockquote": {
        const inner: PMNode[] = [];
        for (const c of n.content ?? []) {
          const s = sanitizeBlock(c, depth + 1);
          if (s && s.type === "paragraph") inner.push(s);
          else if (s) errors.push(`"${s.type}" is not allowed inside a blockquote`);
        }
        return { type: "blockquote", content: inner };
      }
      case "image": {
        if (!opts.allowImages) {
          errors.push("images are not allowed in this region");
          return null;
        }
        const src = String(n.attrs?.src ?? "");
        if (!isAllowedImageSrc(src, opts.supabaseUrl)) {
          errors.push(`image src is not from the editorial-photos bucket or /images (${src.slice(0, 60)})`);
          return null;
        }
        const alt = cleanText(String(n.attrs?.alt ?? "")).trim();
        if (opts.requireImageAlt && !alt) {
          errors.push("every image needs alt text before publication");
        }
        const attribution = cleanText(String(n.attrs?.attribution ?? "")).trim();
        const caption = cleanText(String(n.attrs?.caption ?? "")).trim();
        const mediaId = typeof n.attrs?.mediaId === "string" ? n.attrs.mediaId : null;
        return {
          type: "image",
          attrs: { src, alt, attribution, caption, mediaId },
        };
      }
      default:
        errors.push(`block "${n.type}" is not allowed`);
        return null;
    }
  }

  const content: PMNode[] = [];
  for (const n of root.content) {
    if (n?.type && !BLOCK_TYPES.has(n.type)) {
      errors.push(`block "${n.type}" is not allowed`);
      continue;
    }
    const s = sanitizeBlock(n, 0);
    if (s) content.push(s);
  }

  const text = textParts.join(" ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
  if (text.length > MAX_TEXT_CHARS) errors.push(`content is too long (${text.length} chars; limit ${MAX_TEXT_CHARS})`);
  if (!content.length) errors.push("document is empty");

  return { ok: errors.length === 0, errors, doc: { type: "doc", content }, text };
}

/* ---------------------------------------------------------------------- */
/* text + faq content types                                               */
/* ---------------------------------------------------------------------- */
export function sanitizeTextValue(input: unknown): SanitizeResult {
  const errors: string[] = [];
  const v = (input as { value?: unknown })?.value;
  if (typeof v !== "string") {
    return { ok: false, errors: ["text content must be { value: string }"], text: "" };
  }
  const text = cleanText(v).replace(/\s+/g, " ").trim();
  if (!text) errors.push("text is empty");
  if (text.length > 300) errors.push(`text is too long (${text.length} chars; limit 300)`);
  if (/[<>]/.test(text)) errors.push("angle brackets are not allowed in plain-text regions");
  return { ok: errors.length === 0, errors, doc: { type: "text", attrs: { value: text } } as unknown as PMNode, text };
}

export function sanitizeFaq(input: unknown): SanitizeResult {
  const errors: string[] = [];
  const items = (input as { items?: unknown })?.items;
  if (!Array.isArray(items)) return { ok: false, errors: ["faq content must be { items: [{q,a}] }"], text: "" };
  if (items.length === 0) errors.push("at least one FAQ item is required");
  if (items.length > MAX_FAQ_ITEMS) errors.push(`too many FAQ items (${items.length}; limit ${MAX_FAQ_ITEMS})`);
  const out: { q: string; a: string }[] = [];
  const textParts: string[] = [];
  items.slice(0, MAX_FAQ_ITEMS).forEach((it, i) => {
    const q = cleanText(String((it as { q?: unknown })?.q ?? "")).replace(/\s+/g, " ").trim();
    const a = cleanText(String((it as { a?: unknown })?.a ?? "")).replace(/\s+/g, " ").trim();
    if (!q || !a) errors.push(`FAQ item ${i + 1} needs both a question and an answer`);
    if (q.length > 200) errors.push(`FAQ question ${i + 1} is too long (limit 200)`);
    if (a.length > 1200) errors.push(`FAQ answer ${i + 1} is too long (limit 1200)`);
    if (/[<>]/.test(q + a)) errors.push(`FAQ item ${i + 1}: angle brackets are not allowed`);
    out.push({ q, a });
    textParts.push(q + "\n" + a);
  });
  return {
    ok: errors.length === 0,
    errors,
    doc: { type: "faq", attrs: { items: out } } as unknown as PMNode,
    text: textParts.join("\n"),
  };
}

export function sanitizeContent(
  contentType: ContentType,
  input: unknown,
  opts: { allowImages: boolean; supabaseUrl?: string; requireImageAlt?: boolean }
): SanitizeResult {
  if (contentType === "richtext") return sanitizeRichDoc(input, opts);
  if (contentType === "text") return sanitizeTextValue(input);
  if (contentType === "faq") return sanitizeFaq(input);
  return { ok: false, errors: [`unknown content type ${contentType}`], text: "" };
}

/* ---------------------------------------------------------------------- */
/* SEO validation                                                          */
/* ---------------------------------------------------------------------- */
export function validateSeo(
  title: string | null | undefined,
  description: string | null | undefined,
  existing: { titles: string[]; descriptions: string[] }
): string[] {
  const errors: string[] = [];
  const t = (title ?? "").trim();
  const d = (description ?? "").trim();
  if (t) {
    if (t.length < SEO_TITLE_MIN) errors.push(`SEO title is dangerously short (${t.length} chars; min ${SEO_TITLE_MIN})`);
    if (t.length > SEO_TITLE_MAX) errors.push(`SEO title is too long (${t.length} chars; max ${SEO_TITLE_MAX})`);
    const dup = existing.titles.some((x) => x.trim().toLowerCase() === t.toLowerCase());
    if (dup) errors.push("SEO title exactly duplicates another indexed page");
  }
  if (d) {
    if (d.length < SEO_DESC_MIN) errors.push(`meta description is too short (${d.length} chars; min ${SEO_DESC_MIN})`);
    if (d.length > SEO_DESC_MAX) errors.push(`meta description is too long (${d.length} chars; max ${SEO_DESC_MAX})`);
    const dup = existing.descriptions.some((x) => x.trim().toLowerCase() === d.toLowerCase());
    if (dup) errors.push("meta description exactly duplicates another indexed page");
  }
  return errors;
}

/* ---------------------------------------------------------------------- */
/* risky-claim linter — publication-blocking. Mirrors the content-audit    */
/* rules: no guarantees, no school-assignment promises, no exact incentive */
/* or final-phase claims without verification, no placeholder scaffolding. */
/* ---------------------------------------------------------------------- */
const CLAIM_RULES: { re: RegExp; msg: string }[] = [
  { re: /\bguarantee[ds]?\b|\bwe guarantee\b/i, msg: "guarantees are not allowed in editorial copy" },
  { re: /\bzoned (?:to|for)\b|\bguaranteed enrollment\b|\bassigned school\b/i, msg: "school-assignment claims are not allowed — say 'reported for this listing' / 'verify with the district'" },
  { re: /\bfinal phase\b/i, msg: "'final phase' needs a verified source — publish via the verified inventory pipeline instead" },
  { re: /\$[\d,]+ ?(?:off|credit|incentive|rebate)\b/i, msg: "exact incentive dollar claims need current builder verification" },
  { re: /\b\d+(?:\.\d+)?% ?(?:rate|buydown|apr)\b/i, msg: "exact rate/buydown claims need current lender verification" },
  { re: /lorem ipsum|\bTBD\b|\bTODO\b|\bFIXME\b|PLACEHOLDER|XXXX/i, msg: "placeholder text must be removed before publication" },
  { re: /\b(?:best|#1|number one) (?:school district|schools|builder)\b/i, msg: "unsupported superlatives about schools/builders are not allowed" },
];

export function validateClaims(text: string): string[] {
  const errors: string[] = [];
  for (const r of CLAIM_RULES) if (r.re.test(text)) errors.push(r.msg);
  // keyword stuffing: any non-trivial word appearing absurdly often
  const words = text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [];
  if (words.length >= 40) {
    const counts = new Map<string, number>();
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
    for (const [w, n] of counts) {
      if (n >= 10 && n / words.length > 0.08) {
        errors.push(`"${w}" repeats ${n} times — this reads as keyword stuffing`);
        break;
      }
    }
  }
  return errors;
}

/* ---------------------------------------------------------------------- */
/* region resolution — pure so tests can cover draft/published/fallback    */
/* selection and DB-failure behavior without a database                    */
/* ---------------------------------------------------------------------- */
export interface RegionRow {
  region_key: string;
  content_type: ContentType;
  content_json: unknown;
  seo_title: string | null;
  seo_description: string | null;
  is_draft: boolean;
}

export interface ResolvedRegion {
  contentType: ContentType;
  json: unknown;
  seoTitle: string | null;
  seoDescription: string | null;
  fromDraft: boolean;
}

/** Build the region map a page renders from. In preview, a draft row wins
    over the published row for the same key; outside preview, draft rows
    are ignored entirely. Any load failure upstream yields rows=null and an
    empty map — the code fallback renders. */
export function resolveRegions(rows: RegionRow[] | null, preview: boolean): Record<string, ResolvedRegion> {
  const map: Record<string, ResolvedRegion> = {};
  if (!rows) return map;
  for (const r of rows) {
    if (r.is_draft && !preview) continue;
    const existing = map[r.region_key];
    if (existing && existing.fromDraft && !r.is_draft) continue; // draft already won
    if (existing && !existing.fromDraft && r.is_draft && !preview) continue;
    map[r.region_key] = {
      contentType: r.content_type,
      json: r.content_json,
      seoTitle: r.seo_title,
      seoDescription: r.seo_description,
      fromDraft: r.is_draft,
    };
  }
  return map;
}
