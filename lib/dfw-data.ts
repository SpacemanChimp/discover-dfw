/* Discover DFW — shared geography + city data (ported from the design bundle's dfw-data.js).
   Verified (2026-07): populations = U.S. Census Vintage 2024 estimates (Lantana: ACS 2024
   5-yr, it's a CDP); school ratings = TEA 2025 A–F accountability (txschools.gov); commute
   minutes = OSRM/OpenStreetMap off-peak estimates (calibrated ×0.85, floor 5 min).
   Market figures: price/$sqft/DOM are seeded from NTREIS replica snapshot medians
   (scripts/content/refresh-city-market-figures.mjs, last run 2026-07-15) and serve as
   the static/fallback layer; live surfaces still query snapshots directly. YoY remains
   an EDITORIAL ESTIMATE until a year of snapshot history exists. */
import raw from "./dfw.data.json";

export type LonLat = [number, number];

export interface County {
  id: string;
  name: string;
  labelText: string;
  label: LonLat;
  core?: number;
  tone: number;
  blurb: string;
  poly: LonLat[];
}

export interface Lake {
  name: string;
  label?: LonLat;
  pts: LonLat[];
}

export interface Road {
  n: string;
  w?: number;
  dash?: string;
  pts: LonLat[];
}

export interface Landmark {
  n: string;
  ll: LonLat;
  /** label anchor: "m" middle (default), "s" start, "e" end */
  ta?: string;
  /** label offset from the diamond; defaults dx 0, dy 16 */
  dx?: number;
  dy?: number;
}

export interface City {
  slug: string;
  name: string;
  county: string;
  ll: LonLat;
  anchor: "m" | "s" | "e";
  dx: number;
  dy: number;
  fs: number;
  pop: number;
  price: number;
  ppsf: number;
  dom: number;
  yoy: string;
  featured?: number;
  tagline: string;
  vibe: string;
  isd: string;
  hoods: [string, string][];
  schools: [string, string, string][];
  commute: number[];
  gallery?: string[];
}

export interface NewBuild {
  name: string;
  city: string;
  from: string;
  builders: number;
  status: string;
  note: string;
}

export interface Bounds {
  lonMin: number;
  lonMax: number;
  latMax: number;
  latMin: number;
}

const data = raw as unknown as {
  bounds: Bounds;
  hubs: string[];
  counties: County[];
  lakes: Lake[];
  roads: Road[];
  landmarks: Landmark[];
  cities: City[];
  newBuilds: NewBuild[];
};

export const bounds: Bounds = data.bounds;
export const hubs: string[] = data.hubs;
export const counties: County[] = data.counties;
export const lakes: Lake[] = data.lakes;
export const roads: Road[] = data.roads;
export const landmarks: Landmark[] = data.landmarks;
export const cities: City[] = data.cities;
export const newBuilds: NewBuild[] = data.newBuilds;

export const bySlug: Record<string, City> = Object.fromEntries(
  cities.map((c) => [c.slug, c])
);

export const countyById: Record<string, County> = Object.fromEntries(
  counties.map((c) => [c.id, c])
);

/* ---- geometry: identical projection to the prototype (1160 × 927 viewBox) ---- */
export const VB_W = 1160;
export const VB_H = 927;

export function project(ll: LonLat): [number, number] {
  return [
    ((ll[0] - bounds.lonMin) / (bounds.lonMax - bounds.lonMin)) * VB_W,
    ((bounds.latMax - ll[1]) / (bounds.latMax - bounds.latMin)) * VB_H,
  ];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function pts(arr: LonLat[]): string {
  return arr.map((p) => project(p).map(r1).join(",")).join(" ");
}

/* ---- formatting helpers ---- */
export function fmtK(p: number): string {
  return "$" + Math.round(p / 1000) + "K";
}

export function fmtPop(n: number): string {
  return n >= 1000000
    ? (n / 1000000).toFixed(2) + "M"
    : n >= 10000
    ? Math.round(n / 1000) + "K"
    : Math.round(n / 100) / 10 + "K";
}

export function median(arr: number[]): number {
  const s = arr.slice().sort((a, b) => a - b);
  return s.length % 2
    ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

export function citiesInCounty(id: string): City[] {
  return cities.filter((c) => c.county === id);
}
