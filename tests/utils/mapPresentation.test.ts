import { describe, expect, it } from 'vitest';
import { boundedInsets, projectedOffsetPath, safelyUnproject, continuousOffsetPath, distanceToLineMeters, eligibleCampusLocation, mergeMapStops, nearbyMapStop, routeArrows, shiftedDashArray, splitSharedCorridors, stopsWithinHitArea } from '../../utils/mapPresentation';
import { LINE, makeNetwork } from '../fixtures/transit';
import { haversineMeters } from '../../utils/routeInterpolation';
import { getRouteStops } from '../../utils/transitSelectors';
import type { RouteId, Stop } from '../../types';
import type { LngLat } from '../../utils/routeInterpolation';

const network = makeNetwork();
const routeStops: Record<RouteId, Stop[]> = {
  P2P_EXPRESS: getRouteStops(network, null, 'P2P_EXPRESS'), BAITY_HILL: getRouteStops(network, null, 'BAITY_HILL'),
};
describe('map stop identity and eligibility', () => {
  it('merges a shared ID and preserves the route memberships', () => {
    const stops = mergeMapStops(routeStops, ['P2P_EXPRESS', 'BAITY_HILL']);
    expect(stops).toHaveLength(4);
    expect(stops.find(s => s.id === 'c')?.routeIds).toEqual(['P2P_EXPRESS', 'BAITY_HILL']);
  });
  it('does not merge distinct boarding points with identical names and coordinates', () => {
    const a = network.stops[0];
    expect(mergeMapStops({ P2P_EXPRESS: [a, { ...a, id: 'opposite' }], BAITY_HILL: [] }, ['P2P_EXPRESS'])).toHaveLength(2);
  });
  it('filters route-only stops and updates shared-stop colors', () => {
    const stops = mergeMapStops(routeStops, ['BAITY_HILL']);
    expect(stops.map(s => s.id)).toEqual(['c', 'e']);
    expect(stops[0].routeIds).toEqual(['BAITY_HILL']);
    expect(mergeMapStops(routeStops, [])).toEqual([]);
  });
  it('rejects denied, missing, invalid and out-of-area locations', () => {
    const local = { lat: 35.9105, lon: -79.0478 };
    expect(eligibleCampusLocation(local, false)).toBeNull();
    expect(eligibleCampusLocation(null, true)).toBeNull();
    expect(eligibleCampusLocation({ lat: NaN, lon: 0 }, true)).toBeNull();
    expect(eligibleCampusLocation({ lat: 40.7, lon: -74 }, true)).toBeNull();
    expect(eligibleCampusLocation(local, true)).toBe(local);
  });
  it('finds a nearby stop only from visible stops and a usable location', () => {
    const visible = mergeMapStops(routeStops, ['BAITY_HILL']);
    expect(nearbyMapStop(network.stops[0], visible)?.id).toBe('e');
    expect(nearbyMapStop(null, visible)).toBeNull();
    expect(nearbyMapStop(network.stops[0], [])).toBeNull();
  });
  it('returns all candidates within the 44px hit square, ordered by distance', () => {
    const candidates = [{ id: 'a', point: { x: 110, y: 100 } }, { id: 'b', point: { x: 100, y: 100 } }, { id: 'c', point: { x: 123, y: 100 } }];
    expect(stopsWithinHitArea(candidates, { x: 100, y: 100 }).map(s => s.id)).toEqual(['b', 'a']);
  });
});
describe('shared corridors', () => {
  const sparse: LngLat[] = [[-79.05, 35.9], [-79.04, 35.9]];
  it('measures distance to a segment, not just its endpoints', () => {
    expect(distanceToLineMeters([-79.045, 35.9], sparse)).toBeLessThan(.01);
    expect(distanceToLineMeters([-79.045, 35.9001], sparse)).toBeGreaterThan(10);
  });
  it('separates the common portion with different sampling and preserves direction', () => {
    const line: LngLat[] = [[-79.045, 35.901], [-79.045, 35.9], [-79.04, 35.9]];
    const chunks = splitSharedCorridors(line, sparse, true);
    expect(chunks.some(c => c.offset === 7)).toBe(true);
    expect(chunks.some(c => c.offset === 0)).toBe(true);
    expect(chunks[0].coordinates[0]).toEqual(line[0]);
    expect(chunks.at(-1)?.coordinates.at(-1)).toEqual(line.at(-1));
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].coordinates[0]).toEqual(chunks[i - 1].coordinates.at(-1));
  });
  it('removes lane offsets when Express is hidden', () => {
    expect(splitSharedCorridors(sparse, sparse, false)).toEqual([{ coordinates: sparse, offset: 0 }]);
  });
  it('does not classify a perpendicular crossing as a shared corridor', () => {
    const crossing: LngLat[] = [[-79.045, 35.8995], [-79.045, 35.9005]];
    expect(splitSharedCorridors(crossing, sparse, true).every(c => c.offset === 0)).toBe(true);
  });
});
describe('route direction arrows', () => {
  const express = network.routes[0].patterns[0];
  it('places arrows between stops, pointing the way the route travels, including the loop back', () => {
    const arrows = routeArrows(express);
    expect(arrows.map(a => Math.round(a.bearing))).toEqual([90, 0, 270]);
    expect(arrows.every(a => distanceToLineMeters(a.coordinates, LINE) < 1)).toBe(true);
  });
  it('keeps arrows sparse: at least 300 m apart', () => {
    const arrows = routeArrows({ ...express, stops: [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700].map((distAlong, sequence) => ({ stopId: String(sequence), sequence, distAlong })) });
    expect(arrows.length).toBeGreaterThan(2);
    for (const a of arrows) for (const b of arrows) if (a !== b) expect(haversineMeters(a.coordinates, b.coordinates)).toBeGreaterThanOrEqual(300);
  });
  it('skips gaps between stops that are too short for an arrow', () => {
    const arrows = routeArrows({ ...express, stops: [0, 100, 900].map((distAlong, sequence) => ({ stopId: String(sequence), sequence, distAlong })) });
    expect(arrows.length).toBeGreaterThan(0);
    expect(arrows.every(a => haversineMeters(a.coordinates, LINE[0]) > 100)).toBe(true);
  });
  it('shows both directions on a road driven out and back, without stacking them', () => {
    const outAndBack = { ...express, lengthMeters: 1804, geometry: { type: 'LineString' as const, coordinates: [LINE[0], LINE[1], LINE[0]] },
      stops: [0, 902].map((distAlong, sequence) => ({ stopId: String(sequence), sequence, distAlong })) };
    const [east, west] = routeArrows(outAndBack);
    expect([Math.round(east.bearing), Math.round(west.bearing)]).toEqual([90, 270]);
    expect(haversineMeters(east.coordinates, west.coordinates)).toBeGreaterThanOrEqual(120);
  });
  it('keeps clear of another route\'s arrows', () => {
    const avoid = routeArrows(express);
    const arrows = routeArrows(express, [], avoid);
    for (const a of arrows) for (const b of avoid) expect(haversineMeters(a.coordinates, b.coordinates)).toBeGreaterThanOrEqual(120);
  });
  it('flags arrows on a corridor shared with another route', () => {
    expect(routeArrows(express, LINE).every(a => a.shared)).toBe(true);
    expect(routeArrows(express, [[-79.07, 35.95], [-79.06, 35.95]]).some(a => a.shared)).toBe(false);
  });
  it('returns nothing without a pattern or stops', () => {
    expect(routeArrows(null)).toEqual([]);
    expect(routeArrows({ ...express, stops: [] })).toEqual([]);
  });
});
describe('overlay geometry', () => {
  it('bounds overlays on a short screen without negative map area', () => {
    const p = boundedInsets({ top: 200, bottom: 300, left: 28, right: 68 }, 360, 300);
    expect(p.top + p.bottom).toBeLessThanOrEqual(200);
    expect(p.left + p.right).toBe(96);
  });
});


describe('continuous displayed route offsets', () => {
  const segment = (start: number, end: number, offset: number) => ({ points: [{ x: start, y: 0 }, { x: end, y: 0 }], offset });
  it('joins both directions of an offset transition over 32 pixels', () => {
    const result = continuousOffsetPath([segment(0, 100, 0), segment(100, 200, 7), segment(200, 300, 0)]);
    for (const [x, y] of [[84, 0], [100, 3.5], [116, 7], [184, 7], [200, 3.5], [216, 0]]) {
      expect(result.find(p => p.x === x)?.y).toBeCloseTo(y);
    }
    expect(new Set(result.map(p => p.x)).size).toBe(result.length);
    expect(result.every((p, i) => i === 0 || p.x > result[i - 1].x)).toBe(true);
  });
  it('smooths repeated short overlap changes without disconnected ends', () => {
    const result = continuousOffsetPath([segment(0, 100, 7), segment(100, 108, 0), segment(108, 200, 7)]);
    expect(Math.min(...result.map(p => p.y))).toBeGreaterThanOrEqual(5.25);
    expect(result.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(new Set(result.map(p => p.x)).size).toBe(result.length);
  });
  it('joins bends with a bounded miter and keeps route order', () => {
    const result = continuousOffsetPath([{ points: [{x:0,y:0},{x:100,y:0},{x:100,y:100}], offset:7 }]);
    expect(result).toEqual([{x:0,y:7},{x:93,y:7},{x:93,y:100}]);
    const hairpin = continuousOffsetPath([{points:[{x:0,y:0},{x:100,y:0},{x:0,y:1}],offset:7}]);
    expect(Math.hypot(hairpin[1].x-100,hairpin[1].y)).toBeLessThanOrEqual(14.000001);
  });
  it('closes the rendered loop even when the seam changes offset', () => {
    const result = continuousOffsetPath([
      { points: [{x:0,y:0},{x:100,y:0},{x:100,y:100}], offset:7 },
      { points: [{x:100,y:100},{x:0,y:100},{x:0,y:0}], offset:0 },
    ]);
    expect(result[0]).toEqual(result.at(-1));
    expect(result[0]).toEqual({x:3.5,y:3.5});
    expect(result.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
  it('preserves the input path with Express hidden and never mutates source points', () => {
    const points = [{x:0,y:0},{x:50,y:15},{x:100,y:0}];
    const copy = structuredClone(points);
    expect(continuousOffsetPath([{points,offset:0}])).toEqual(copy);
    continuousOffsetPath([{points,offset:7}]);
    expect(points).toEqual(copy);
  });
  it('bounds work near the pitched horizon and rejects invalid projection', () => {
    expect(continuousOffsetPath([segment(-1e9,0,0),segment(0,1e9,7)]).length).toBeLessThan(15);
    expect(continuousOffsetPath([{points:[{x:0,y:0},{x:Infinity,y:5}],offset:7}])).toEqual([]);
    expect(continuousOffsetPath([])).toEqual([]);
  });
});


describe('camera projection safety', () => {
  const chunks = [{ coordinates: [[0, 0], [100, 0]] as LngLat[], offset: 7 }];
  const project = ([x, y]: LngLat) => ({ x, y });
  it('inverts the complete offset path, including its shifted endpoints', () => {
    expect(projectedOffsetPath(chunks, project, p => [p.x, p.y])).toEqual([[0, 7], [100, 7]]);
  });
  it('rejects a horizon failure as a whole rather than cutting out route points', () => {
    expect(projectedOffsetPath(chunks, project, p => {
      if (p.x === 100) throw new Error('Invalid LngLat object');
      return [p.x, p.y];
    })).toBeNull();
    expect(projectedOffsetPath(chunks, project, () => [NaN, NaN])).toBeNull();
    expect(safelyUnproject({x:0,y:0}, () => [0, 91])).toBeNull();
  });
  it('uses an invertible alternate projection without losing lane separation', () => {
    const result = projectedOffsetPath(chunks, project, () => { throw new Error('horizon'); })
      ?? projectedOffsetPath(chunks, project, p => [p.x, p.y]);
    expect(result).toEqual([[0, 7], [100, 7]]);
  });
});

describe('flowing route dashes', () => {
  it('shifts one dash forward along the line without changing the pattern length', () => {
    expect(shiftedDashArray(1, 6, 0)).toEqual([0, 0, 1, 6]);
    expect(shiftedDashArray(1, 6, 3)).toEqual([0, 3, 1, 3]);
    expect(shiftedDashArray(1, 6, 6.5)).toEqual([0.5, 6, 0.5, 0]);
    expect(shiftedDashArray(1, 6, 7)).toEqual([0, 0, 1, 6]);
    for (let s = 0; s < 7; s += .5) expect(shiftedDashArray(1, 6, s).reduce((a, b) => a + b)).toBeCloseTo(7);
  });
});
