/* SEO Community Editor (CB-3a) — content drafts, SERVER-ONLY.

   Per-page editorial/SEO drafts keyed city/hood. A draft becomes public
   only through the CB-2 exporter's --content mode writing
   lib/hood-content.json on a reviewed branch — contentFor()'s generated
   copy stays the fallback for every page without a key. This module owns
   the types, the reader for the CONTENT desk, the page inventory, and
   the lint engine the portal runs live (the exporter re-implements the
   same rules in scripts/content/export-community-drafts.mjs and fails
   closed independently — if you change a rule HERE, change it THERE). */
import "server-only";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { cities, countyById, bySlug, type City, type NewBuild } from "@/lib/dfw-data";
import { hoodsForCity, type HoodRef } from "@/lib/hoods";
import contentRaw from "@/lib/hood-content.json";

export type ContentDraftLifecycle = "draft" | "ready" | "exported" | "live" | "archived";

export type ContentDraft = {
  id: string;
  citySlug: string;
  hoodSlug: string;
  seoTitle: string | null;
  seoDescription: string | null;
  tagline: string | null;
  intro: string[];
  homesCopy: string | null;
  highlights: { title: string; note: string }[];
  faq: { q: string; a: string }[];
  newBuild: { amenities: string[]; buyerNotes: string[] } | null;
  links: { label: string; href: string }[];
  mlsSnapshot: Record<string, unknown> | null;
  lint: LintResult | null;
  readyForExport: boolean;
  lifecycle: ContentDraftLifecycle;
  createdBy: string;
  updatedAt: string;
};

type Row = {
  id: string;
  city_slug: string;
  hood_slug: string;
  seo_title: string | null;
  seo_description: string | null;
  tagline: string | null;
  intro_json: string[] | null;
  homes_copy: string | null;
  highlights_json: { title: string; note: string }[] | null;
  faq_json: { q: string; a: string }[] | null;
  newbuild_json: { amenities: string[]; buyerNotes: string[] } | null;
  links_json: { label: string; href: string }[] | null;
  mls_snapshot_json: Record<string, unknown> | null;
  lint_json: LintResult | null;
  ready_for_export: boolean;
  lifecycle: ContentDraftLifecycle;
  created_by: string;
  updated_at: string;
};

function fromRow(r: Row): ContentDraft {
  return {
    id: r.id,
    citySlug: r.city_slug,
    hoodSlug: r.hood_slug,
    seoTitle: r.seo_title,
    seoDescription: r.seo_description,
    tagline: r.tagline,
    intro: r.intro_json ?? [],
    homesCopy: r.homes_copy,
    highlights: r.highlights_json ?? [],
    faq: r.faq_json ?? [],
    newBuild: r.newbuild_json,
    links: r.links_json ?? [],
    mlsSnapshot: r.mls_snapshot_json,
    lint: r.lint_json,
    readyForExport: r.ready_for_export,
    lifecycle: r.lifecycle,
    createdBy: r.created_by,
    updatedAt: r.updated_at,
  };
}

const SELECT =
  "id, city_slug, hood_slug, seo_title, seo_description, tagline, intro_json, homes_copy, highlights_json, faq_json, newbuild_json, links_json, mls_snapshot_json, lint_json, ready_for_export, lifecycle, created_by, updated_at";

/** Non-archived content drafts. Empty list until 0013 is applied. */
export async function getContentDrafts(): Promise<ContentDraft[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  try {
    const { data, error } = await db
      .from("community_content_drafts")
      .select(SELECT)
      .neq("lifecycle", "archived")
      .order("updated_at", { ascending: false })
      .limit(300);
    if (error || !data) return [];
    return (data as Row[]).map(fromRow);
  } catch {
    return [];
  }
}

/* ---- page inventory --------------------------------------------------------
   Every valid content key is an EXISTING page from the hoodsForCity union.
   The picker also shows whether a page already has a custom hood-content
   key (editing it = updating that key on export). */

const customKeys = new Set(Object.keys(contentRaw as Record<string, unknown>));

export type PageOption = {
  citySlug: string;
  cityName: string;
  hoodSlug: string;
  hoodName: string;
  isNewBuild: boolean;
  hasCustomContent: boolean;
};

export function pageInventory(): PageOption[] {
  const out: PageOption[] = [];
  for (const c of cities) {
    for (const h of hoodsForCity(c)) {
      out.push({
        citySlug: c.slug,
        cityName: c.name,
        hoodSlug: h.slug,
        hoodName: h.name,
        isNewBuild: Boolean(h.newBuild),
        hasCustomContent: customKeys.has(`${c.slug}/${h.slug}`),
      });
    }
  }
  return out;
}

export function findPage(citySlug: string, hoodSlug: string): { city: City; hood: HoodRef } | null {
  const city = cities.find((c) => c.slug === citySlug);
  if (!city) return null;
  const hood = hoodsForCity(city).find((h) => h.slug === hoodSlug);
  return hood ? { city, hood } : null;
}

/** Community Studio (Amendment 5): the synthesized page context for a
    NOT-yet-exported community draft — the SAME City + HoodRef shapes the
    private preview renders with, so the strict lint can validate a draft
    page's content BEFORE it exists. The dataset stays the truth for real
    pages, and the exporters still verify page existence at export time. */
export function draftPageContext(row: {
  type: string;
  name: string;
  city_slug: string;
  slug: string;
  status_label?: string | null;
  from_label?: string | null;
  builders_count?: number | null;
  note?: string | null;
}): { city: City; hood: HoodRef } | null {
  const city = bySlug[row.city_slug];
  if (!city) return null;
  const nb: NewBuild | undefined =
    row.type === "new_build"
      ? {
          name: row.name,
          city: row.city_slug,
          from: row.from_label ?? "$— (not set)",
          builders: row.builders_count ?? 0,
          status: row.status_label ?? "STATUS NOT SET",
          note: row.note ?? "",
        }
      : undefined;
  return {
    city,
    hood: { slug: row.slug, name: row.name, note: row.note?.trim() || `${row.name} in ${city.name}`, citySlug: row.city_slug, newBuild: nb },
  };
}

/* ---- lint engine ------------------------------------------------------------
   Mirrored by the exporter (change a rule there too). Errors block the
   ready toggle and fail the export closed; warnings inform only. */

export type LintIssue = { level: "error" | "warning"; field: string; message: string };
export type LintResult = { errors: LintIssue[]; warnings: LintIssue[]; at: string };

export const TITLE_MIN = 25;
export const TITLE_MAX = 60;
export const DESC_MIN = 70;
export const DESC_MAX = 160;
export const INTRO_MIN_PARAGRAPHS = 2;
export const INTRO_MIN_CHARS = 300;
export const FAQ_MIN_ENTRIES = 2;
export const FAQ_ANSWER_MIN = 40;

/* review-safe claims screen — the hard-rule categories. Matches are ERRORS:
   school zoning/assignment wording, final-phase claims, builder-roster
   assertions, and guarantee language all need human verification that the
   portal cannot provide. */
export const RISKY_CLAIM_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /\b(zoned to|zoned for|attendance zones?|feeds? into|assigned to)\b/i, why: "school zoning claims need district verification before publishing (hard rule)" },
  { re: /\battends?\b.{0,40}\b(elementary|middle|high school|isd)\b/i, why: "school assignment claims need district verification before publishing (hard rule)" },
  { re: /\bfinal phase\b/i, why: '"final phase" claims need builder verification before publishing (hard rule)' },
  { re: /\b(official|exclusive|complete|full) (builder|builders|builder list|roster)\b/i, why: "builder-roster assertions need verification — MLS-observed counts only (hard rule)" },
  { re: /\bguarantee[ds]?\b/i, why: "guarantee language is not review-safe" },
  { re: /\bprices? (are|start|starting|begin)\b.{0,30}\$\d/i, why: "exact pricing claims beyond the from-band are not review-safe — use the band" },
];

/** The metadata formulas generateMetadata uses — MIRRORED from
    app/city/[slug]/[hood]/page.tsx so duplicate detection can compare a
    custom title/description against every page's generated fallback. If
    the formulas change there, change them here. */
export function formulaTitle(city: City, hood: HoodRef): string {
  return hood.newBuild
    ? `${hood.name} — New Construction Homes in ${city.name}, TX`
    : `${hood.name} — ${city.name}, TX Neighborhood Guide & Homes`;
}
export function formulaDescription(city: City, hood: HoodRef): string {
  const county = countyById[city.county];
  const nb = hood.newBuild;
  return nb
    ? `${hood.name} is a new-build community in ${city.name}, TX (${county.name} County) — ${nb.status.toLowerCase()}, priced from the ${nb.from} with ${nb.builders} active builders. Amenities, buyer resources, schools & FAQs.`
    : `${hood.name} neighborhood in ${city.name}, TX (${county.name} County): what it's like to live there, homes & real estate character, ${city.isd} schools, commutes, and FAQs.`;
}

export const normalizeSeo = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Near-duplicate: exact normalized match, or word-set Jaccard ≥ 0.9. */
export function isNearDuplicate(a: string, b: string): boolean {
  const na = normalizeSeo(a);
  const nb = normalizeSeo(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const wa = new Set(na.split(" "));
  const wb = new Set(nb.split(" "));
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const union = wa.size + wb.size - inter;
  return union > 0 && inter / union >= 0.9;
}

export type SeoCorpusEntry = { key: string; title: string | null; description: string | null; source: "formula" | "draft" | "exported" };

/** All titles/descriptions a custom value must not collide with: every
    page's formula pair, every exported hood-content seo pair, and every
    other non-archived draft's pair. */
export function buildSeoCorpus(otherDrafts: { citySlug: string; hoodSlug: string; seoTitle: string | null; seoDescription: string | null }[]): SeoCorpusEntry[] {
  const corpus: SeoCorpusEntry[] = [];
  for (const c of cities) {
    for (const h of hoodsForCity(c)) {
      corpus.push({ key: `${c.slug}/${h.slug}`, title: formulaTitle(c, h), description: formulaDescription(c, h), source: "formula" });
    }
  }
  for (const [key, val] of Object.entries(contentRaw as Record<string, { seo?: { title?: string; description?: string } }>)) {
    if (val?.seo?.title || val?.seo?.description) {
      corpus.push({ key, title: val.seo.title ?? null, description: val.seo.description ?? null, source: "exported" });
    }
  }
  for (const d of otherDrafts) {
    corpus.push({ key: `${d.citySlug}/${d.hoodSlug}`, title: d.seoTitle, description: d.seoDescription, source: "draft" });
  }
  return corpus;
}

function screenClaims(field: string, text: string, issues: LintIssue[]) {
  for (const { re, why } of RISKY_CLAIM_PATTERNS) {
    const m = re.exec(text);
    if (m) issues.push({ level: "error", field, message: `"${m[0]}" — ${why}` });
  }
}

/** Full lint. `forExport` additionally requires the complete core body
    (contentFor returns a hit AS-IS — a partial hit would render holes). */
export function lintContentDraft(
  draft: Pick<ContentDraft, "citySlug" | "hoodSlug" | "seoTitle" | "seoDescription" | "tagline" | "intro" | "homesCopy" | "highlights" | "faq" | "newBuild">,
  corpus: SeoCorpusEntry[],
  forExport: boolean,
  /** Community Studio: synthesized context for an ACTIVE not-yet-exported
      draft (draftPageContext) — every rule runs against it; without it a
      missing page stays a hard error exactly as before */
  draftPage?: { city: City; hood: HoodRef } | null
): LintResult {
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];
  const key = `${draft.citySlug}/${draft.hoodSlug}`;

  const page = findPage(draft.citySlug, draft.hoodSlug) ?? draftPage ?? null;
  if (!page) {
    errors.push({ level: "error", field: "page", message: `${key} is not an existing page — content can only attach to a live hood/new-build page` });
    return { errors, warnings, at: new Date().toISOString() };
  }

  if (draft.seoTitle != null && draft.seoTitle !== "") {
    const t = draft.seoTitle.trim();
    if (t.length < TITLE_MIN || t.length > TITLE_MAX)
      errors.push({ level: "error", field: "seoTitle", message: `title is ${t.length} chars — must be ${TITLE_MIN}–${TITLE_MAX}` });
    if (isNearDuplicate(t, formulaTitle(page.city, page.hood)))
      errors.push({ level: "error", field: "seoTitle", message: "identical to this page's generated title — omit the override instead" });
    for (const c of corpus) {
      if (c.key === key) continue;
      if (c.title && isNearDuplicate(t, c.title))
        errors.push({ level: "error", field: "seoTitle", message: `duplicates the ${c.source} title of ${c.key}` });
    }
    screenClaims("seoTitle", t, errors);
  }
  if (draft.seoDescription != null && draft.seoDescription !== "") {
    const d = draft.seoDescription.trim();
    if (d.length < DESC_MIN || d.length > DESC_MAX)
      errors.push({ level: "error", field: "seoDescription", message: `description is ${d.length} chars — must be ${DESC_MIN}–${DESC_MAX}` });
    if (isNearDuplicate(d, formulaDescription(page.city, page.hood)))
      errors.push({ level: "error", field: "seoDescription", message: "identical to this page's generated description — omit the override instead" });
    for (const c of corpus) {
      if (c.key === key) continue;
      if (c.description && isNearDuplicate(d, c.description))
        errors.push({ level: "error", field: "seoDescription", message: `duplicates the ${c.source} description of ${c.key}` });
    }
    screenClaims("seoDescription", d, errors);
  }

  const intro = (draft.intro ?? []).map((p) => p.trim()).filter(Boolean);
  const introChars = intro.join(" ").length;
  const hasCore = Boolean(draft.tagline?.trim()) && intro.length > 0 && Boolean(draft.homesCopy?.trim()) && (draft.highlights?.length ?? 0) > 0 && (draft.faq?.length ?? 0) > 0;

  if (forExport && !hasCore)
    errors.push({ level: "error", field: "body", message: "export requires the full core body (tagline, intro, homes, highlights, FAQ) — contentFor() renders a hit as-is, so partial content would leave holes" });

  if (intro.length > 0) {
    if (intro.length < INTRO_MIN_PARAGRAPHS || introChars < INTRO_MIN_CHARS)
      errors.push({ level: "error", field: "intro", message: `intro is ${intro.length} paragraph(s) / ${introChars} chars — minimum ${INTRO_MIN_PARAGRAPHS} paragraphs and ${INTRO_MIN_CHARS} chars (thin-content gate)` });
    screenClaims("intro", intro.join(" "), errors);
  }
  if (draft.tagline?.trim()) screenClaims("tagline", draft.tagline, errors);
  if (draft.homesCopy?.trim()) screenClaims("homes", draft.homesCopy, errors);
  for (const [i, h] of (draft.highlights ?? []).entries()) {
    if (!h.title?.trim() || !h.note?.trim()) errors.push({ level: "error", field: `highlights[${i}]`, message: "highlight needs both a title and a note" });
    else screenClaims(`highlights[${i}]`, `${h.title} ${h.note}`, errors);
  }
  const faq = draft.faq ?? [];
  if (faq.length > 0 && faq.length < FAQ_MIN_ENTRIES)
    errors.push({ level: "error", field: "faq", message: `FAQ has ${faq.length} entry — minimum ${FAQ_MIN_ENTRIES} (it renders as FAQPage structured data)` });
  for (const [i, f] of faq.entries()) {
    if (!f.q?.trim()) errors.push({ level: "error", field: `faq[${i}]`, message: "question is empty" });
    if ((f.a ?? "").trim().length < FAQ_ANSWER_MIN)
      errors.push({ level: "error", field: `faq[${i}]`, message: `answer is ${(f.a ?? "").trim().length} chars — minimum ${FAQ_ANSWER_MIN}` });
    screenClaims(`faq[${i}]`, `${f.q} ${f.a}`, errors);
  }
  if (draft.newBuild) {
    if (!page.hood.newBuild)
      errors.push({ level: "error", field: "newBuild", message: `${key} is not a new-build page — remove the newBuild block` });
    for (const s of [...(draft.newBuild.amenities ?? []), ...(draft.newBuild.buyerNotes ?? [])]) screenClaims("newBuild", s, errors);
  }

  if (!draft.seoTitle && !draft.seoDescription)
    warnings.push({ level: "warning", field: "seo", message: "no SEO overrides set — the generated formula title/description will be used (fine, just intentional?)" });

  return { errors, warnings, at: new Date().toISOString() };
}
