/* Land-search domain logic — PURE + client-safe (no React/server/env), so the
   /land page, the toolbar, the cards, the map popups, AND the server provider
   share one definition of what "land" is and how it's presented. Unit-tested
   by scripts/tests/land-core.test.mjs.

   Grounded in the REAL NTREIS feed (probed 2026-07-17): land is
   PropertyType='Land' (there is NO 'Farm' PropertyType in this feed — ranches
   are Land/PropertySubType='Ranch'). Observed on-market Land subtypes:
   UnimprovedLand, ImprovedLand, Ranch, Retail, Warehouse. LotSizeAcres is
   populated on 99.8% of land rows; Utilities/Water/Sewer/Road/Zoning are too
   sparse or free-text to filter on. */

export type LandCategory = "unimproved" | "improved" | "ranch" | "commercial";

/** Consumer-facing categories → the exact RESO PropertySubType values that
    back them (from the live feed). Order is the chip order. */
export const LAND_CATEGORIES: { key: LandCategory; label: string; subtypes: string[] }[] = [
  { key: "unimproved", label: "Unimproved", subtypes: ["UnimprovedLand"] },
  { key: "improved", label: "Improved", subtypes: ["ImprovedLand"] },
  { key: "ranch", label: "Farm / ranch", subtypes: ["Ranch"] },
  { key: "commercial", label: "Commercial", subtypes: ["Retail", "Warehouse"] },
];

const CAT_BY_KEY = new Map(LAND_CATEGORIES.map((c) => [c.key, c]));
const CAT_BY_SUBTYPE = new Map<string, LandCategory>();
for (const c of LAND_CATEGORIES) for (const s of c.subtypes) CAT_BY_SUBTYPE.set(s, c.key);

export function isLandCategory(v: unknown): v is LandCategory {
  return typeof v === "string" && CAT_BY_KEY.has(v as LandCategory);
}

/** The PropertySubType values to match for a category (for the DB filter). */
export function subtypesForCategory(cat: LandCategory): string[] {
  return CAT_BY_KEY.get(cat)?.subtypes ?? [];
}

/** Human label for a raw MLS land subtype (card/popup display). */
export function landSubtypeLabel(subtype: string | null | undefined): string {
  switch (subtype) {
    case "UnimprovedLand":
      return "Unimproved land";
    case "ImprovedLand":
      return "Improved land";
    case "Ranch":
      return "Farm / ranch";
    case "Retail":
      return "Commercial land";
    case "Warehouse":
      return "Commercial land";
    default:
      return "Land";
  }
}

/** Reverse map a subtype to its consumer category (null if unknown). */
export function categoryForSubtype(subtype: string | null | undefined): LandCategory | null {
  return (subtype && CAT_BY_SUBTYPE.get(subtype)) || null;
}

/* Acreage sanity bounds — a lot_size outside this is feed garbage and is
   treated as "unavailable" for the price-per-acre math and the acre label. */
const MIN_VALID_ACRES = 0.01;
const MAX_VALID_ACRES = 200000; // King Ranch is ~825k ac; nothing in DFW is near this

export function acresAreUsable(acres: number | null | undefined): boolean {
  return typeof acres === "number" && Number.isFinite(acres) && acres >= MIN_VALID_ACRES && acres <= MAX_VALID_ACRES;
}

/** List price ÷ acreage. Returns null (never a divide-by-zero, never a
    fabricated number) when either input is missing/unreliable. This is a
    LIST-price ratio for comparison only — never an appraisal or sold price. */
export function pricePerAcre(price: number | null | undefined, acres: number | null | undefined): number | null {
  if (!price || !Number.isFinite(price) || price <= 0) return null;
  if (!acresAreUsable(acres)) return null;
  return Math.round(price! / acres!);
}

/** "0.34 ac" · "12 ac" · "340 ac" — omit for unusable acreage. */
export function formatAcres(acres: number | null | undefined): string | null {
  if (!acresAreUsable(acres)) return null;
  const a = acres!;
  const num = a < 10 ? a.toFixed(2).replace(/\.?0+$/, "") : Math.round(a).toLocaleString("en-US");
  return `${num} ac`;
}

/** "$221,893/ac" — clearly labeled elsewhere as a list-price ratio. */
export function formatPricePerAcre(n: number | null): string | null {
  return n === null ? null : `$${n.toLocaleString("en-US")}/ac`;
}
