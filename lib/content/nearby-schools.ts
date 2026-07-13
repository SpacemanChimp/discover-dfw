/* Nearby-schools accessor — reads the checked-in dataset produced by
   scripts/build-nearby-schools.mjs (TEA campus directory + A-F ratings,
   nearest rated neighborhood campus per level from the city centroid).

   LAUNCH-SAFE CONTRACT: proximity context ONLY. Copy that renders this data
   must say "nearby", carry the assignments-vary-by-address line, and never
   use zoning/assignment language — hood pages have no address-boundary
   verification. */
import raw from "./nearby-schools.json";

export type NearbySchoolLevel = "Elementary" | "Middle" | "High";

export interface NearbySchool {
  name: string;
  district: string;
  level: NearbySchoolLevel;
  /** TEA A–F accountability rating (real, campus-exact — same record). */
  rating: string;
  /** Straight-line miles from the CITY centroid (hoods carry no coords). */
  miles: number;
  /** Campus mailing city — may differ from the page's city; display it. */
  city: string;
  /** False when no same-district campus of this level exists nearby. */
  sameDistrict: boolean;
}

const data = raw as unknown as {
  source: string;
  sourceUrl: string;
  ratingYear: number;
  retrieved: string;
  method: string;
  cities: Record<string, NearbySchool[]>;
};

export const NEARBY_SCHOOLS_META = {
  source: data.source,
  ratingYear: data.ratingYear,
  retrieved: data.retrieved,
};

/** Nearest rated campuses for a city (empty when the dataset has none —
    callers hide the section cleanly). */
export function nearbySchoolsFor(citySlug: string): NearbySchool[] {
  return data.cities[citySlug] ?? [];
}
