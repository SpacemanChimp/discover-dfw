/* Geo helpers for radius + polygon search — pure math, client-safe.
   Coordinates are [lon, lat] to match Listing.lonLat and the city dataset. */

export type LonLat = [number, number];

const R_MILES = 3958.8;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in miles (Haversine). */
export function milesBetween(a: LonLat, b: LonLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.sqrt(s));
}

/** Lat/lon bounding box enclosing the radius — the cheap DB prefilter;
    exact circle membership is refined with milesBetween afterwards. */
export function boundingBox(center: LonLat, miles: number) {
  const dLat = miles / 69;
  const dLon = miles / (69 * Math.cos(toRad(center[1])) || 1);
  return {
    minLat: center[1] - dLat,
    maxLat: center[1] + dLat,
    minLon: center[0] - dLon,
    maxLon: center[0] + dLon,
  };
}

/** Radius options offered in the toolbar. */
export const RADIUS_OPTIONS = [5, 10, 15, 25] as const;

/* ---- polygon search (drawn map boundary) ---- */

/** Point-in-polygon via ray casting. Points exactly on an edge may land
    either way — irrelevant for a hand-drawn search boundary. */
export function pointInPolygon(pt: LonLat, poly: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Perpendicular distance from a point to the line through a–b (degrees —
    fine for RDP shape comparison at DFW scale). */
function perpendicularDistance(pt: LonLat, a: LonLat, b: LonLat): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(pt[0] - a[0], pt[1] - a[1]);
  return Math.abs(dy * pt[0] - dx * pt[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

/** One Ramer–Douglas–Peucker pass at a fixed epsilon (recursive). */
function rdp(pts: LonLat[], epsilon: number): LonLat[] {
  if (pts.length <= 2) return pts.slice();
  const a = pts[0];
  const b = pts[pts.length - 1];
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpendicularDistance(pts[i], a, b);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist <= epsilon) return [a, b];
  const left = rdp(pts.slice(0, index + 1), epsilon);
  const right = rdp(pts.slice(index), epsilon);
  return left.slice(0, -1).concat(right);
}

/** Simplify a freehand-drawn boundary with Ramer–Douglas–Peucker, doubling
    epsilon until the output fits in maxPoints (default 30 — keeps the "poly"
    URL param short and the point-in-polygon refine cheap). */
export function simplifyPolygon(pts: LonLat[], maxPoints = 30): LonLat[] {
  if (pts.length <= maxPoints) return pts.slice();
  let epsilon = 0.00005; // ~5 m in degrees — start near-lossless, tune upward
  let out = rdp(pts, epsilon);
  while (out.length > maxPoints) {
    epsilon *= 2;
    out = rdp(pts, epsilon);
  }
  return out;
}

/** "lon,lat;lon,lat;…" at 4 decimals (~11 m) — the "poly" URL param. */
export function serializePolygon(poly: LonLat[]): string {
  return poly.map(([lon, lat]) => `${lon.toFixed(4)},${lat.toFixed(4)}`).join(";");
}

/** Parse the "poly" URL param. Returns undefined unless every point is a
    finite lon,lat pair inside a loose North Texas window (lon -104..-93,
    lat 25..37) and the count is 3..40 — junk params fail silently. */
export function parsePolygon(s: string): LonLat[] | undefined {
  if (!s) return undefined;
  const pts: LonLat[] = [];
  for (const pair of s.split(";")) {
    const nums = pair.split(",");
    if (nums.length !== 2) return undefined;
    const lon = Number(nums[0]);
    const lat = Number(nums[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return undefined;
    if (lon < -104 || lon > -93 || lat < 25 || lat > 37) return undefined;
    pts.push([lon, lat]);
  }
  return pts.length >= 3 && pts.length <= 40 ? pts : undefined;
}

/** Lat/lon bounding box of a polygon — the cheap DB prefilter; exact
    membership is refined with pointInPolygon afterwards. */
export function polygonBounds(poly: LonLat[]): {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
} {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const [lon, lat] of poly) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}
