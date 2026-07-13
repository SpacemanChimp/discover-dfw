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

const clean = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s && s.toLowerCase() !== "none" ? s : undefined;
};

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
