/* MLS-reported school fields (RESO Data Dictionary names, probed against the
   NTREIS Trestle feed 2026-07-13: ~96-98% of on-market residential listings
   carry them; the gaps are commercial/land).

   Shared by the trestle provider (API rows), the local provider (replicated
   `raw`), and the sync job's SELECT list.

   LAUNCH-SAFE DISPLAY RULE: these are what the LISTING RECORD reports — never
   a zoning/assignment claim. UI copy must say "reported for this listing" and
   carry verify-with-the-district wording. Never infer them from city/hood. */
import type { ListingSchools } from "./types";

export const RESO_SCHOOL_FIELDS = [
  "ElementarySchool",
  "ElementarySchoolDistrict",
  "MiddleOrJuniorSchool",
  "MiddleOrJuniorSchoolDistrict",
  "HighSchool",
  "HighSchoolDistrict",
] as const;

/** The three RESO district fields, in the order they map to the generated
    columns high/middle/elementary_school_district (migration 0017). */
export const RESO_DISTRICT_FIELDS = [
  "HighSchoolDistrict",
  "MiddleOrJuniorSchoolDistrict",
  "ElementarySchoolDistrict",
] as const;

/** Normalize a school/district NAME for lookup + dedup only (never display).
    Lowercases, drops punctuation, collapses whitespace, folds the standalone
    level abbreviations (HS/MS/ES) to their long level word, and drops the
    non-distinctive "school" token — so "Guyer HS", "Guyer High", and "Guyer
    High School" collapse to one key, while distinctive parts of a name are
    untouched ("Middle Creek", "Highland" are NOT mangled, since only 2-letter
    whole-word abbreviations are folded). The canonical MLS-reported string is
    preserved separately for display. Pure + client-safe. */
export function normalizeSchoolKey(name: string): string {
  let s =
    " " +
    (name || "")
      .toLowerCase()
      .replace(/[.'’`]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() +
    " ";
  s = s
    .replace(/ (h s|hs) /g, " high ")
    .replace(/ (m s|ms) /g, " middle ")
    .replace(/ (e s|es) /g, " elementary ")
    .replace(/ (jr high|junior high) /g, " middle ")
    .replace(/ school /g, " "); // never distinctive; "High School" == "High"
  return s.replace(/\s+/g, " ").trim();
}

const clean = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s && s.toLowerCase() !== "none" ? s : undefined;
};

/* Bridge editorial/TEA school names to the MLS-reported names, which vary
   ("Denton High School" vs "Denton H S" vs "Denton"). Strip the generic
   level/type suffix and keep the distinctive core, which becomes an
   ILIKE token (matched against the level-specific field, so an
   elementary token can't collide with a high school). Pure + client-safe. */
export function schoolMatchToken(name: string): string {
  return (name || "")
    .replace(/\b(senior|junior)\b/gi, " ")
    .replace(/\b(high|elementary|middle|intermediate|primary|el|jr|sr)\b/gi, " ")
    .replace(/\bh\s*s\b/gi, " ") // "H S" / "HS"
    .replace(/\bm\s*s\b/gi, " ")
    .replace(/\be\s*s\b/gi, " ")
    .replace(/\bschool\b/gi, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim();
}

/** Map the RESO school fields off a feed payload (live API row or the
    replicated `raw` column). Returns undefined when the record reports
    nothing — callers hide the section or show the "not reported" note. */
export function schoolsFromReso(
  p: Record<string, unknown> | null | undefined
): ListingSchools | undefined {
  if (!p) return undefined;
  const mk = (name: unknown, district: unknown) => {
    const n = clean(name);
    return n ? { name: n, district: clean(district) } : undefined;
  };
  const s: ListingSchools = {
    elementary: mk(p.ElementarySchool, p.ElementarySchoolDistrict),
    middleOrJunior: mk(p.MiddleOrJuniorSchool, p.MiddleOrJuniorSchoolDistrict),
    high: mk(p.HighSchool, p.HighSchoolDistrict),
  };
  return s.elementary || s.middleOrJunior || s.high ? s : undefined;
}
