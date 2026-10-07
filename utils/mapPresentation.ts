import type { Coordinate, RouteId, RoutePattern, Stop } from '../types';
import { ROUTE_IDS } from '../data/routes';
import { findNearestStop, getDistanceMiles, SERVICE_RADIUS_MILES, UNC_CAMPUS_CENTER } from './geo';
import { createRouteInterpolator, haversineMeters, type LngLat } from './routeInterpolation';

export interface MapStop extends Stop { routeIds: RouteId[] }
export interface ScreenPoint { x: number; y: number }
export interface RouteChunk { coordinates: LngLat[]; offset: number }
export interface ViewportInsets { top: number; bottom: number; left: number; right: number }

export function mergeMapStops(routeStops: Record<RouteId, Stop[]>, enabled: readonly RouteId[]): MapStop[] {
  const byId = new Map<string, MapStop>();
  for (const route of ROUTE_IDS.filter(id => enabled.includes(id))) {
    for (const stop of routeStops[route]) {
      const prior = byId.get(stop.id);
      if (prior) { if (!prior.routeIds.includes(route)) prior.routeIds.push(route); }
      else byId.set(stop.id, { ...stop, routeIds: [route] });
    }
  }
  return [...byId.values()];
}

export function eligibleCampusLocation(location: Coordinate | null, resolved: boolean): Coordinate | null {
  return resolved && location && Number.isFinite(location.lat) && Number.isFinite(location.lon)
    && getDistanceMiles(location, UNC_CAMPUS_CENTER) <= SERVICE_RADIUS_MILES ? location : null;
}

export function nearbyMapStop(location: Coordinate | null, stops: MapStop[]): MapStop | null {
  return location ? findNearestStop(location, stops) as MapStop | null : null;
}

export function pointSegmentDistance(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Local meter projection: sufficient for a campus-scale overlap test, including sparse lines. */
export function distanceToLineMeters(p: LngLat, line: LngLat[]): number {
  const sx = 111320 * Math.cos(p[1] * Math.PI / 180), sy = 111320;
  const project = (q: LngLat): ScreenPoint => ({ x: (q[0] - p[0]) * sx, y: (q[1] - p[1]) * sy });
  let distance = Infinity;
  for (let i = 1; i < line.length; i++) distance = Math.min(distance, pointSegmentDistance({ x: 0, y: 0 }, project(line[i - 1]), project(line[i])));
  return distance;
}

/** Split at short samples so differently sampled, partly shared segments still separate. */
export function splitSharedCorridors(line: LngLat[], other: LngLat[], separate: boolean): RouteChunk[] {
  if (line.length < 2) return [];
  if (!separate || other.length < 2) return [{ coordinates: line, offset: 0 }];
  const chunks: RouteChunk[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const samples = Math.max(1, Math.ceil(haversineMeters(a, b) / 10));
    const at = (t: number): LngLat => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for (let n = 0; n < samples; n++) {
      const start = at(n / samples), end = at((n + 1) / samples);
      // Check both ends, not just a crossing at the midpoint.
      const shared = distanceToLineMeters(start, other) <= 4 && distanceToLineMeters(end, other) <= 4;
      const offset = shared ? 7 : 0;
      const prior = chunks[chunks.length - 1];
      if (prior?.offset === offset) prior.coordinates.push(end);
      else chunks.push({ coordinates: [start, end], offset });
    }
  }
  return chunks;
}

export function stopsWithinHitArea<T extends { point: ScreenPoint }>(stops: T[], click: ScreenPoint): T[] {
  return stops.filter(s => Math.abs(s.point.x - click.x) <= 22 && Math.abs(s.point.y - click.y) <= 22)
    .sort((a, b) => Math.hypot(a.point.x - click.x, a.point.y - click.y) - Math.hypot(b.point.x - click.x, b.point.y - click.y));
}

export interface RouteArrow { coordinates: LngLat; bearing: number; shared: boolean }

/** Direction arrows anchored to the route, not the screen, so they never move or multiply
 * with zoom. Midway between stops (extras on long gaps, none on short ones) and sparse:
 * 300 m between arrows pointing the same way, but a road driven both ways gets both
 * directions. `avoid` keeps these clear of another route's arrows. */
export function routeArrows(pattern: RoutePattern | null, sharedWith: LngLat[] = [], avoid: RouteArrow[] = []): RouteArrow[] {
  const route = pattern ? createRouteInterpolator(pattern.geometry.coordinates) : null;
  const stops = (pattern?.stops ?? []).map(s => s.distAlong).filter(Number.isFinite).sort((a, b) => a - b);
  if (!pattern || !route || !stops.length) return [];
  const total = route.totalLengthMeters;
  // GMV distances and haversine lengths differ slightly; keep arrows between the right stops.
  const at = stops.map(d => d * total / Math.max(pattern.lengthMeters, stops[stops.length - 1]));
  const turn = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
  const arrows: RouteArrow[] = [];
  const fits = (coordinates: LngLat, bearing: number) =>
    !avoid.some(a => haversineMeters(a.coordinates, coordinates) < 120) &&
    !arrows.some(a => haversineMeters(a.coordinates, coordinates) < (turn(a.bearing, bearing) > 90 ? 120 : 300));
  at.forEach((start, i) => {
    const gap = i + 1 < at.length ? at[i + 1] - start : total - start + at[0];
    if (gap < 200) return;
    const count = Math.max(1, Math.round(gap / 800));
    for (let k = 1; k <= count; k++) {
      // Slide along the gap when the midpoint is taken, but never onto a stop.
      for (const shift of [0, 100, -100, 200, -200]) {
        const along = gap * k / (count + 1) + shift;
        if (along < 60 || along > gap - 60) continue;
        const d = (start + along) % total;
        const onShared = [d - 30, d, d + 30].map(x => sharedWith.length > 1 && distanceToLineMeters(route.pointAt(x), sharedWith) <= 8);
        // Where two routes merge or split, the drawn lane offset is still changing.
        if (onShared.some(Boolean) && !onShared.every(Boolean)) continue;
        const coordinates = route.pointAt(d), bearing = route.bearingAt(d);
        if (!fits(coordinates, bearing)) continue;
        arrows.push({ coordinates, bearing, shared: onShared.every(Boolean) });
        break;
      }
    }
  });
  return arrows;
}

/** Leave usable map space on short/landscape screens, even with expanded details. */
export function boundedInsets(insets: ViewportInsets, width: number, height: number): ViewportInsets {
  const vertical = Math.max(0, height - 100), horizontal = Math.max(0, width - 100);
  const vy = Math.min(1, vertical / (insets.top + insets.bottom || 1));
  const hx = Math.min(1, horizontal / (insets.left + insets.right || 1));
  return { top: Math.floor(insets.top * vy), bottom: Math.floor(insets.bottom * vy), left: Math.floor(insets.left * hx), right: Math.floor(insets.right * hx) };
}

export interface ScreenRouteChunk { points: ScreenPoint[]; offset: number }

/** A pitched camera cannot always invert points near or beyond its horizon. */
export function safelyUnproject(point: ScreenPoint, unproject: (point: ScreenPoint) => LngLat): LngLat | null {
  try {
    if (![point.x, point.y].every(Number.isFinite)) return null;
    const coordinate = unproject(point);
    return coordinate.every(Number.isFinite) && Math.abs(coordinate[1]) <= 90 ? coordinate : null;
  } catch { return null; }
}

export function projectedOffsetPath(chunks: RouteChunk[], project: (coordinate: LngLat) => ScreenPoint, unproject: (point: ScreenPoint) => LngLat): LngLat[] | null {
  const screen = continuousOffsetPath(chunks.map(chunk => ({ points: chunk.coordinates.map(project), offset: chunk.offset })));
  if (screen.length < 2) return null;
  const result: LngLat[] = [];
  for (const point of screen) {
    const coordinate = safelyUnproject(point, unproject);
    if (!coordinate) return null;
    result.push(coordinate);
  }
  return result;
}

/** One connected display path. Average the offset over a 32 px window instead
 * of ending one offset feature and starting another at a different screen point.
 * Sampling is bounded by vertices and transitions, not offscreen segment length. */
export function continuousOffsetPath(chunks: ScreenRouteChunk[], transitionPixels = 32): ScreenPoint[] {
  const points: ScreenPoint[] = [];
  const offsets: number[] = [];
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.points.length; i++) {
      const p = chunk.points[i];
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return [];
      const last = points[points.length - 1];
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1e-6) continue;
      if (last) offsets.push(chunk.offset);
      points.push({ ...p });
    }
  }
  if (points.length < 2 || offsets.every(v => v === 0)) return points;
  const lengths = [0], areas = [0];
  for (let i = 0; i < offsets.length; i++) {
    const length = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    lengths.push(lengths[i] + length);
    areas.push(areas[i] + length * offsets[i]);
  }
  const total = lengths[lengths.length - 1];
  const closed = Math.hypot(points[0].x - points.at(-1)!.x, points[0].y - points.at(-1)!.y) < 1e-6;
  const half = Math.min(Math.max(transitionPixels / 2, 1), total / 2);
  const segmentAt = (distance: number) => {
    let low = 0, high = offsets.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (lengths[mid + 1] <= distance) low = mid + 1; else high = mid;
    }
    return low;
  };
  const integral = (distance: number): number => {
    if (distance < 0) return closed ? -areas.at(-1)! + integral(distance + total) : distance * offsets[0];
    if (distance > total) return areas.at(-1)! + (closed ? integral(distance - total) : (distance - total) * offsets.at(-1)!);
    const i = segmentAt(distance);
    return areas[i] + (distance - lengths[i]) * offsets[i];
  };
  const distances = new Set(lengths);
  for (let i = 0; i < offsets.length; i++) {
    const previous = i === 0 ? (closed ? offsets.at(-1) : offsets[0]) : offsets[i - 1];
    if (offsets[i] === previous) continue;
    for (let step = -4; step <= 4; step++) {
      let d = lengths[i] + half * step / 4;
      if (closed) d = (d + total) % total;
      if (d > 0 && d < total) distances.add(d);
    }
  }
  const normal = (i: number) => {
    const a = points[i], b = points[i + 1], length = lengths[i + 1] - lengths[i];
    return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  };
  const result = [...distances].sort((a, b) => a - b).map(d => {
    const i = segmentAt(d), t = (d - lengths[i]) / (lengths[i + 1] - lengths[i]);
    const p = { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
    let n = normal(i);
    if (Math.abs(d - lengths[i]) < 1e-6 && (i > 0 || closed)) {
      const before = normal(i === 0 ? offsets.length - 1 : i - 1);
      const divisor = 1 + before.x * n.x + before.y * n.y;
      if (divisor > .01) {
        n = { x: (before.x + n.x) / divisor, y: (before.y + n.y) / divisor };
        const scale = Math.min(1, 2 / Math.hypot(n.x, n.y));
        n = { x: n.x * scale, y: n.y * scale };
      }
    }
    const offset = (integral(d + half) - integral(d - half)) / (2 * half);
    return { x: p.x + n.x * offset, y: p.y + n.y * offset };
  });
  if (closed) result[result.length - 1] = { ...result[0] };
  return result;
}

/** A [dash, gap] line pattern shifted forward along the line by `shift`, in line-width
 * units. Stepping `shift` from 0 to dash + gap makes the dashes march in travel direction. */
export function shiftedDashArray(dash: number, gap: number, shift: number): number[] {
  const period = dash + gap, s = ((shift % period) + period) % period;
  return s + dash <= period ? [0, s, dash, period - s - dash] : [s + dash - period, period - dash, period - s, 0];
}
