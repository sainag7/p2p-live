/**
 * Interpolation along a route LineString for bus animation.
 * Precomputes cumulative distances; provides pointAt(dist) and bearingAt(dist).
 * Uses Haversine for segment distances. Cache per route (key by coords).
 */

export type LngLat = [number, number];

export function haversineMeters(a: LngLat, b: LngLat): number {
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
export function bearingBetween(a: LngLat, b: LngLat): number {
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
  /** Index of the first segment ending at or past `d` (binary search; called every animation frame). */
  const segmentAt = (d: number) => {
    let lo = 0, hi = cumul.length - 2;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumul[mid + 1] < d) lo = mid + 1; else hi = mid;
    }
    return lo;
  };

  return {
    totalLengthMeters,
    pointAt(distMeters: number): LngLat {
      let d = distMeters % totalLengthMeters;
      if (d < 0) d += totalLengthMeters;
      if (d <= 0) return c[0];
      if (d >= totalLengthMeters) return c[c.length - 1];
      const i = segmentAt(d);
      const t = (d - cumul[i]) / (cumul[i + 1] - cumul[i]);
      return [
        c[i][0] + t * (c[i + 1][0] - c[i][0]),
        c[i][1] + t * (c[i + 1][1] - c[i][1]),
      ];
    },
    bearingAt(distMeters: number): number {
      let d = distMeters % totalLengthMeters;
      if (d < 0) d += totalLengthMeters;
      if (d <= 0) return bearingBetween(c[0], c[1]);
      if (d >= totalLengthMeters) return bearingBetween(c[c.length - 2], c[c.length - 1]);
      const i = segmentAt(d);
      return bearingBetween(c[i], c[i + 1]);
    },
  };
}

/** Project point onto route polyline; returns distance along route (0..totalLength) and nearest point. */
export function projectPointToRoute(
  coords: LngLat[],
  point: LngLat
): { distanceAlong: number; nearestPoint: LngLat } {
  if (!coords.length) return { distanceAlong: 0, nearestPoint: point };
  if (coords.length === 1) return { distanceAlong: 0, nearestPoint: coords[0] };
  const cumul = cumulativeDistances(coords);
  const total = cumul[cumul.length - 1];
  let bestDist = Infinity;
  let bestT = 0;
  let bestSeg = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const ax = a[0] - point[0];
    const ay = a[1] - point[1];
    const bx = b[0] - a[0];
    const by = b[1] - a[1];
    const denom = bx * bx + by * by || 1;
    let t = Math.max(0, Math.min(1, -(ax * bx + ay * by) / denom));
    const px = a[0] + t * bx;
    const py = a[1] + t * by;
    const dSq = (point[0] - px) ** 2 + (point[1] - py) ** 2;
    if (dSq < bestDist) {
      bestDist = dSq;
      bestT = t;
      bestSeg = i;
    }
  }
  const distanceAlong = cumul[bestSeg] + bestT * (cumul[bestSeg + 1] - cumul[bestSeg]);
  const nearestPoint: LngLat = [
    coords[bestSeg][0] + bestT * (coords[bestSeg + 1][0] - coords[bestSeg][0]),
    coords[bestSeg][1] + bestT * (coords[bestSeg + 1][1] - coords[bestSeg][1]),
  ];
  return { distanceAlong: Math.max(0, Math.min(total, distanceAlong)), nearestPoint };
}

/** Slice route polyline from distance dStart to dEnd (meters). Wraps if dEnd < dStart. */
export function sliceRouteByDistance(
  coords: LngLat[],
  dStart: number,
  dEnd: number
): LngLat[] {
  if (!coords.length || coords.length < 2) return [];
  const cumul = cumulativeDistances(coords);
  const total = cumul[cumul.length - 1];
  if (total <= 0) return [];
  let start = ((dStart % total) + total) % total;
  let end = ((dEnd % total) + total) % total;
  const interp = createRouteInterpolator(coords);
  if (!interp) return [];
  const out: LngLat[] = [];
  if (end >= start) {
    const numPoints = Math.max(2, Math.ceil((end - start) / 20));
    for (let i = 0; i <= numPoints; i++) {
      const d = start + (i / numPoints) * (end - start);
      out.push(interp.pointAt(d));
    }
  } else {
    const num1 = Math.max(2, Math.ceil((total - start) / 20));
    for (let i = 0; i <= num1; i++) {
      out.push(interp.pointAt(start + (i / num1) * (total - start)));
    }
    const num2 = Math.max(2, Math.ceil(end / 20));
    for (let i = 1; i <= num2; i++) {
      out.push(interp.pointAt((i / num2) * end));
    }
  }
  return out;
}
