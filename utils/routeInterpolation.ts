/**
 * Interpolation along a route LineString for bus animation.
 * Precomputes cumulative distances; provides pointAt(dist) and bearingAt(dist).
 * Uses Haversine for segment distances. Cache per route (key by coords).
 */

export type LngLat = [number, number];

function haversineMeters(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

/** Cumulative distances from start (meters). Length = coords.length; cumul[0] = 0. */
function cumulativeDistances(coords: LngLat[]): number[] {
  const cumul: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cumul[i] = cumul[i - 1] + haversineMeters(coords[i - 1], coords[i]);
  }
  return cumul;
}

/** Bearing in degrees (0 = north, 90 = east) between two points. */
function bearing(a: LngLat, b: LngLat): number {
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export interface RouteInterpolator {
  totalLengthMeters: number;
  pointAt(distMeters: number): LngLat;
  bearingAt(distMeters: number): number;
}

const cache = new Map<string, { cumul: number[]; coords: LngLat[] }>();

function cacheKey(coords: LngLat[]): string {
  if (coords.length === 0) return '';
  return `${coords.length}-${coords[0].join(',')}-${coords[coords.length - 1].join(',')}`;
}

/**
 * Precomputes cumulative distances along a LineString. Returns an interpolator.
 * Cached per route (by simple key from coords).
 */
export function createRouteInterpolator(coords: LngLat[]): RouteInterpolator | null {
  if (!coords || coords.length < 2) return null;
  const key = cacheKey(coords);
  let entry = cache.get(key);
  if (!entry) {
    entry = { cumul: cumulativeDistances(coords), coords };
    cache.set(key, entry);
  }
  const { cumul, coords: c } = entry;
  const totalLengthMeters = cumul[cumul.length - 1];

  return {
    totalLengthMeters,
    pointAt(distMeters: number): LngLat {
      let d = distMeters % totalLengthMeters;
      if (d < 0) d += totalLengthMeters;
      if (d <= 0) return c[0];
      if (d >= totalLengthMeters) return c[c.length - 1];
      let i = 0;
      while (i < cumul.length - 1 && cumul[i + 1] < d) i++;
      const t = (d - cumul[i]) / (cumul[i + 1] - cumul[i]);
      return [
        c[i][0] + t * (c[i + 1][0] - c[i][0]),
        c[i][1] + t * (c[i + 1][1] - c[i][1]),
      ];
    },
    bearingAt(distMeters: number): number {
      let d = distMeters % totalLengthMeters;
      if (d < 0) d += totalLengthMeters;
      if (d <= 0) return bearing(c[0], c[1]);
      if (d >= totalLengthMeters) return bearing(c[c.length - 2], c[c.length - 1]);
      let i = 0;
      while (i < cumul.length - 1 && cumul[i + 1] < d) i++;
      return bearing(c[i], c[i + 1]);
    },
  };
}
