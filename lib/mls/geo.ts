/* Geo helpers for radius search — pure math, client-safe.
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
