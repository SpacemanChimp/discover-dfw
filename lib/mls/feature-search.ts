/* Feature Search SEO v1 — the pure contract for /homes/features, the six
   metro feature searches, and registry-approved city pages. Client-safe and
   dependency-light (relative imports keep it node --test runnable).

   Every feature maps to AUTHORITATIVE structured MLS fields (audited
   2026-07-24 against the live NTREIS/Trestle feed — coverage in
   parentheses). Remarks-text matching is never used:

     with-pool        PoolFeatures enums (100%) -> 0023 has_private_pool
     on-acreage       LotSizeAcres (99.8%) + PropertyType='Residential'
     3-car-garage     GarageSpaces (88%)   -> 0023 garage_spaces
     single-story     Levels (100%)        -> 0023 levels = 'One'
     5-plus-bedrooms  BedroomsTotal        -> beds >= 5
     open-houses      OpenHouse resource, future events only (live, cached)

   Rejected in the audit (kept for the record): PoolPrivateYN (1.8%
   populated) and StoriesTotal (2.7%) — both fail the reliability bar.

   PUBLISHING MODEL: the six metro pages and the hub are always indexable
   (live feed permitting). City-feature pages are indexable ONLY when
   listed in CITY_FEATURE_REGISTRY below — an explicit, reviewed launch
   set. Any other /homes/<feature>/<city> URL still works for users but is
   noindex,follow, canonicalizes to itself, and never enters the sitemap.
   The registry decides publication; live inventory decides the results —
   a brief inventory dip never flips indexing on and off. */

import type { SearchFilters } from "./types";

export type FeatureSlug =
  | "with-pool"
  | "on-acreage"
  | "3-car-garage"
  | "single-story"
  | "5-plus-bedrooms"
  | "open-houses";

export interface FeatureDef {
  slug: FeatureSlug;
  /** Short human name for chips/links, e.g. "Pool homes". */
  name: string;
  /** Uppercase chip label for toolbars/bands. */
  chip: string;
  /** Literal metro H1. */
  h1: string;
  /** Literal city H1 builder. */
  h1City: (cityName: string) => string;
  /** The forced server predicates for this feature. */
  filters: Partial<SearchFilters>;
  /** One-line statement of the authoritative MLS field, shown on page. */
  fieldNote: string;
  /** Metro <title> (absolute) and meta description. */
  title: string;
  description: string;
  /** City title/description builders (county adds real variation). */
  titleCity: (cityName: string) => string;
  descriptionCity: (cityName: string, countyName: string) => string;
}

export const FEATURES: Record<FeatureSlug, FeatureDef> = {
  "with-pool": {
    slug: "with-pool",
    name: "Pool homes",
    chip: "POOL",
    h1: "DFW homes with pools",
    h1City: (c) => `${c} homes with pools`,
    filters: { pool: true },
    fieldNote:
      "Matched on the MLS PoolFeatures field: every home here reports a private pool feature such as In Ground or Gunite. Community-pool-only listings are excluded.",
    title: "DFW Homes with Pools for Sale - Private Pool Homes | Discover DFW",
    description:
      "Every DFW home for sale with a private pool, matched on the structured MLS pool field, not keyword guesses. Live counts, map search, and honest filters.",
    titleCity: (c) => `${c} Homes with Pools for Sale | Discover DFW`,
    descriptionCity: (c, county) =>
      `Homes for sale with a private pool in ${c}, ${county} County. Matched on the MLS pool field and updated from the NTREIS feed, with map search and saved-search alerts.`,
  },
  "on-acreage": {
    slug: "on-acreage",
    name: "Homes on acreage",
    chip: "ACREAGE",
    h1: "DFW homes on acreage",
    h1City: (c) => `${c} homes on acreage`,
    filters: { minAcres: 1, residentialOnly: true },
    fieldNote:
      "Matched on the MLS lot size field: residential listings on one acre or more. Vacant land is excluded here and lives on its own Land search.",
    title: "DFW Homes on Acreage for Sale - 1+ Acre Homes | Discover DFW",
    description:
      "Houses on an acre or more across Dallas-Fort Worth. Real homes only, never vacant lots, matched on the MLS lot size field with live inventory counts.",
    titleCity: (c) => `${c} Homes on Acreage for Sale - 1+ Acre | Discover DFW`,
    descriptionCity: (c, county) =>
      `Homes on one acre or more for sale in ${c}, ${county} County. Residential listings only, matched on MLS lot size, with vacant land kept on the separate Land search.`,
  },
  "3-car-garage": {
    slug: "3-car-garage",
    name: "3-car garage homes",
    chip: "3-CAR GARAGE",
    h1: "DFW homes with 3-car garages",
    h1City: (c) => `${c} homes with 3-car garages`,
    filters: { garageMin: 3 },
    fieldNote:
      "Matched on the MLS garage spaces count: every home here reports three or more garage spaces in its structured record.",
    title: "DFW Homes with 3-Car Garages for Sale | Discover DFW",
    description:
      "Homes for sale with three or more garage spaces across Dallas-Fort Worth, matched on the structured MLS garage count with live map search.",
    titleCity: (c) => `${c} Homes with 3-Car Garages | Discover DFW`,
    descriptionCity: (c, county) =>
      `Three-car-garage homes for sale in ${c}, ${county} County, matched on the MLS garage spaces count. Live inventory, map view, and saved-search alerts.`,
  },
  "single-story": {
    slug: "single-story",
    name: "Single-story homes",
    chip: "SINGLE STORY",
    h1: "DFW single-story homes",
    h1City: (c) => `${c} single-story homes`,
    filters: { singleStory: true },
    fieldNote:
      "Matched on the MLS Levels field: every home here is recorded as exactly one story. Story-and-a-half and split-level homes are excluded.",
    title: "DFW Single-Story Homes for Sale - One-Story Houses | Discover DFW",
    description:
      "One-story homes for sale across Dallas-Fort Worth, matched on the MLS Levels field. No lofts or story-and-a-half surprises, with live counts and map search.",
    titleCity: (c) => `${c} Single-Story Homes for Sale | Discover DFW`,
    descriptionCity: (c, county) =>
      `Single-story homes for sale in ${c}, ${county} County, matched on the MLS Levels field so a second floor never sneaks in. Live inventory and map search.`,
  },
  "5-plus-bedrooms": {
    slug: "5-plus-bedrooms",
    name: "5+ bedroom homes",
    chip: "5+ BEDROOMS",
    h1: "DFW homes with 5+ bedrooms",
    h1City: (c) => `${c} homes with 5+ bedrooms`,
    filters: { minBeds: 5 },
    fieldNote:
      "Matched on the MLS bedroom count: every home here reports five or more bedrooms in its structured record.",
    title: "DFW Homes with 5+ Bedrooms for Sale | Discover DFW",
    description:
      "Five-bedroom-and-up homes across Dallas-Fort Worth for big households, multigenerational setups, and dedicated office space. Matched on the MLS bedroom count.",
    titleCity: (c) => `${c} Homes with 5+ Bedrooms for Sale | Discover DFW`,
    descriptionCity: (c, county) =>
      `Homes with five or more bedrooms for sale in ${c}, ${county} County, matched on the MLS bedroom count. Live counts, map search, and saved-search alerts.`,
  },
  "open-houses": {
    slug: "open-houses",
    name: "Open houses",
    chip: "OPEN HOUSES",
    h1: "DFW open houses",
    h1City: (c) => `${c} open houses`,
    filters: { openHousesOnly: true },
    fieldNote:
      "Matched on scheduled MLS open-house events: every listing here has a future open house on the books. Events are refreshed through the day; confirm times before you drive.",
    title: "DFW Open Houses This Weekend and Beyond | Discover DFW",
    description:
      "Every scheduled open house across Dallas-Fort Worth, pulled from structured MLS events rather than remarks. Dates, time windows, and live map search.",
    titleCity: (c) => `${c} Open Houses This Weekend | Discover DFW`,
    descriptionCity: (c, county) =>
      `Scheduled open houses in ${c}, ${county} County, from structured MLS event records. See dates and time windows, then plan the drive once.`,
  },
};

export const FEATURE_SLUGS = Object.keys(FEATURES) as FeatureSlug[];

export function isFeatureSlug(s: string): s is FeatureSlug {
  return s in FEATURES;
}

/* ---------------------------------------------------------------------------
   CITY-FEATURE LAUNCH REGISTRY — the explicit, reviewed publication set.
   Selection criteria (read-only inventory audit, 2026-07-24): at least 12
   matching on-market listings at audit time, clear buyer intent, reliable
   structured data for the feature, and no canonical conflicts. Adding a
   row here is a deliberate editorial act — inventory alone never flips
   indexing. Keep entries sorted by feature then city.
--------------------------------------------------------------------------- */
export const CITY_FEATURE_REGISTRY: ReadonlyArray<{ feature: FeatureSlug; city: string }> = [
  // filled by the FS2 inventory audit — see scripts/tests/feature-search.test.mjs
];

const registryKey = (feature: string, city: string) => `${feature}:${city}`;
const REGISTRY_SET = new Set(CITY_FEATURE_REGISTRY.map((e) => registryKey(e.feature, e.city)));

/** Is this exact city-feature page in the reviewed launch set? */
export function cityFeaturePublished(feature: string, citySlug: string): boolean {
  return REGISTRY_SET.has(registryKey(feature, citySlug));
}

export function publishedCitiesFor(feature: FeatureSlug): string[] {
  return CITY_FEATURE_REGISTRY.filter((e) => e.feature === feature).map((e) => e.city);
}

/** Up to `cap` published feature searches for one city (city-page links). */
export function publishedFeaturesForCity(citySlug: string, cap = 4): FeatureSlug[] {
  return CITY_FEATURE_REGISTRY.filter((e) => e.city === citySlug)
    .map((e) => e.feature)
    .slice(0, cap);
}

export function featurePath(feature: FeatureSlug, citySlug?: string): string {
  return citySlug ? `/homes/${feature}/${citySlug}` : `/homes/${feature}`;
}

/** Sitemap entries for this v1: the hub, the six metro pages, and ONLY
    registry-approved city pages. Nothing else ever enters the sitemap. */
export function featureSitemapPaths(): string[] {
  return [
    "/homes/features",
    ...FEATURE_SLUGS.map((f) => featurePath(f)),
    ...CITY_FEATURE_REGISTRY.map((e) => featurePath(e.feature, e.city)),
  ];
}

/** Indexability decision for a feature URL. Metro pages + hub index (live
    feed permitting, decided by the route); city pages index only from the
    registry. Everything else is noindex,follow with a self-canonical —
    the page still works, it just never competes in search. */
export function featureIndexable(feature: string, citySlug?: string): boolean {
  if (!isFeatureSlug(feature)) return false;
  if (!citySlug) return true;
  return cityFeaturePublished(feature, citySlug);
}
