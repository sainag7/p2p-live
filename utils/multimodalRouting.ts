/**
 * Multimodal routing: Walk → Bus → Walk using Mapbox walking directions and GMV pattern geometry.
 * Returns both a walk-only journey and the best bus-assisted journey, so riders can choose.
 */

import type {
  Coordinate,
  Destination,
  Journey,
  JourneySegment,
  LineStringGeometry,
  LiveSnapshot,
  RoutePattern,
  Stop,
  TransitNetwork,
  WalkingStep,
} from '../types';
import { findKNearestStops } from './geo';
import { sliceRouteByDistance } from './routeInterpolation';
import { getUpcomingRouteArrivals, isRouteOperatingNow } from './serviceSchedule';
import { ROUTE_IDS, ROUTE_NAMES } from '../data/routes';
import { getActivePattern } from './transitSelectors';
import { createRequestQueue } from './requestQueue';
import { estimateBusLeg, fallbackRideSec, recommendedMode, rideDistanceMeters, type TripMode, type TripOptions } from './tripPlanning';

const BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL) || '';
const K_NEAREST = 6;
const MAX_WALK_METERS = 1200;
const MAX_WALK_DURATION_SEC = 15 * 60;

export interface WalkDirectionsResult {
  durationSec: number;
  distanceMeters: number;
  geometry: { type: string; coordinates: [number, number][] };
  steps: { instruction: string; distanceMeters: number; durationSec: number }[];
}

/** Walks between the same points (to ~1 m) are reused for a few minutes: trips from one spot share their stop legs. */
const WALK_CACHE_MS = 5 * 60 * 1000;
const walkCache = new Map<string, { at: number; result: Promise<WalkDirectionsResult | null> }>();
// Trip and starred-place planning share four slots, including simultaneous plans.
const requestWalk = createRequestQueue(4);
const MAX_WALK_CACHE_ENTRIES = 200;

export function getWalkDirections(from: Coordinate, to: Coordinate): Promise<WalkDirectionsResult | null> {
  const key = [from.lon, from.lat, to.lon, to.lat].map((n) => n.toFixed(5)).join(',');
  const hit = walkCache.get(key);
  if (hit && Date.now() - hit.at < WALK_CACHE_MS) return hit.result;
  const result = requestWalk(() => fetchWalkDirections(from, to));
  if (walkCache.size >= MAX_WALK_CACHE_ENTRIES) walkCache.delete(walkCache.keys().next().value!);
  walkCache.set(key, { at: Date.now(), result });
  // Failures are retried next time rather than cached.
  void result.then((r) => { if (!r && walkCache.get(key)?.result === result) walkCache.delete(key); });
  return result;
}

async function fetchWalkDirections(from: Coordinate, to: Coordinate): Promise<WalkDirectionsResult | null> {
  const fromStr = `${from.lon},${from.lat}`;
  const toStr = `${to.lon},${to.lat}`;
  try {
    const res = await fetch(`${BASE}/api/mapbox/directions/walk?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.geometry || !data.geometry.coordinates) return null;
    return {
      durationSec: data.durationSec ?? 0,
      distanceMeters: data.distanceMeters ?? 0,
      geometry: data.geometry,
      steps: Array.isArray(data.steps) ? data.steps : [],
    };
  } catch {
    return null;
  }
}

/** A stop on a pattern, in pattern order (first occurrence only). */
interface PatternStopRef {
  stop: Stop;
  distAlong: number;
  index: number;
}

function patternStopRefs(pattern: RoutePattern, stopsById: Map<string, Stop>): PatternStopRef[] {
  const seen = new Set<string>();
  const refs: PatternStopRef[] = [];
  for (const ps of pattern.stops) {
    const stop = stopsById.get(ps.stopId);
    if (!stop || seen.has(ps.stopId)) continue;
    seen.add(ps.stopId);
    refs.push({ stop, distAlong: ps.distAlong, index: refs.length });
  }
  return refs;
}

/** Ordered stops from board index to alight index (forward, with wrap). */
function orderedStopsBetween(stops: PatternStopRef[], boardIndex: number, alightIndex: number): PatternStopRef[] {
  const n = stops.length;
  if (n === 0) return [];
  if (boardIndex === alightIndex) return [stops[boardIndex]];
  const out: PatternStopRef[] = [];
  let i = boardIndex;
  while (true) {
    out.push(stops[i]);
    if (i === alightIndex) break;
    i = (i + 1) % n;
    if (out.length > n) break;
  }
  return out;
}

function walkSegment(
  fromName: string,
  toName: string,
  fromCoords: Coordinate,
  toCoords: Coordinate,
  walk: WalkDirectionsResult
): JourneySegment {
  return {
    type: 'walk',
    fromName,
    toName,
    fromCoords,
    toCoords,
    distanceMeters: walk.distanceMeters,
    durationMin: Math.ceil(walk.durationSec / 60),
    durationSec: walk.durationSec,
    instruction: `Walk to ${toName}`,
    geometry: walk.geometry as LineStringGeometry,
    steps: walk.steps as WalkingStep[],
  };
}

interface StopCandidate {
  ref: PatternStopRef;
  walk: WalkDirectionsResult;
}

export interface MultimodalInput {
  origin: Coordinate;
  /** Shown as the first step's start; defaults to the rider's current location. */
  originName?: string;
  destination: Destination;
  network: TransitNetwork | null;
  snapshot: LiveSnapshot | null;
  /** Publish the usable direct walk before bus alternatives finish. */
  onWalkReady?: (walk: Journey) => void;
}

function makeJourney(mode: TripMode, destination: Destination, segments: JourneySegment[], totalSec: number, now: Date): Journey {
  return {
    id: `journey-${mode}-${now.getTime()}`,
    destination,
    totalDurationMin: Math.ceil(totalSec / 60),
    segments,
    startTime: now,
    arrivalTime: new Date(now.getTime() + totalSec * 1000),
  };
}

export async function computeTripOptions(input: MultimodalInput): Promise<TripOptions> {
  const { origin, originName = 'Current Location', destination, network, snapshot } = input;
  const destCoord: Coordinate = { lat: destination.lat, lon: destination.lon };
  const now = new Date();

  // Start the direct walk now; it need not block independent walks to/from stops.
  let directWalk: Journey | null = null;
  const walkOnlyRequest = getWalkDirections(origin, destCoord).then(result => {
    if (result?.geometry) {
      directWalk = makeJourney('walk', destination, [walkSegment(originName, destination.name, origin, destCoord, result)], result.durationSec, now);
      input.onWalkReady?.(directWalk);
    }
    return result;
  });

  // The best bus trip competes only with other bus trips, so it is offered even when walking wins.
  let best: { totalSec: number; segments: JourneySegment[] } | null = null;
  let anyRouteRunning = false;
  let anyStopsInReach = false;

  const stopsById = new Map((network?.stops ?? []).map((s) => [s.id, s]));

  const liveUsable = snapshot != null && (snapshot.status === 'live' || snapshot.status === 'degraded');
  const liveVehicles = liveUsable ? snapshot.vehicles : [];

  for (const routeId of ROUTE_IDS) {
    const hasLiveBuses = liveVehicles.some((v) => v.routeId === routeId);
    if (!hasLiveBuses && !isRouteOperatingNow(routeId, now)) continue;
    anyRouteRunning = true;
    const pattern = getActivePattern(network, snapshot, routeId);
    if (!pattern || pattern.geometry.coordinates.length < 2) continue;
    const refs = patternStopRefs(pattern, stopsById);
    if (refs.length < 2) continue;
    const refByStopId = new Map(refs.map((r) => [r.stop.id, r]));
    const routeStops = refs.map((r) => r.stop);
    const routeName = ROUTE_NAMES[routeId];
    const timetableSec = getUpcomingRouteArrivals(routeId, now, 6).map((minutes) => minutes * 60);
    /** Non-vehicle arrivals at a stop: GMV schedule predictions when live, else the timetable. */
    const scheduledAtStop = (stopId: string): number[] => {
      const live = liveUsable
        ? (snapshot?.arrivalsByStop[stopId] ?? []).filter((a) => a.routeId === routeId).map((a) => a.etaSec)
        : [];
      return live.length > 0 ? live : timetableSec;
    };

    const candidates = async (near: Coordinate, boarding: boolean): Promise<StopCandidate[]> => {
      const walks = await Promise.all(findKNearestStops(near, routeStops, K_NEAREST)
        .filter(({ distanceMeters }) => distanceMeters <= MAX_WALK_METERS)
        .map(async ({ stop }) => {
          const walk = await getWalkDirections(boarding ? origin : stop, boarding ? stop : destCoord);
          return walk && walk.durationSec <= MAX_WALK_DURATION_SEC ? { ref: refByStopId.get(stop.id)!, walk } : null;
        }));
      // Preserve nearest-first ordering so equal-time candidates stay deterministic.
      return walks.filter((candidate): candidate is StopCandidate => candidate != null);
    };
    const [boardCandidates, alightCandidates] = await Promise.all([candidates(origin, true), candidates(destCoord, false)]);
    if (boardCandidates.length && alightCandidates.length) anyStopsInReach = true;

    for (const board of boardCandidates) {
      for (const alight of alightCandidates) {
        if (board.ref.stop.id === alight.ref.stop.id) continue;
        const forwardStops = orderedStopsBetween(refs, board.ref.index, alight.ref.index);
        const distance = rideDistanceMeters(board.ref.distAlong, alight.ref.distAlong, pattern.lengthMeters);
        const leg = estimateBusLeg({
          vehicles: liveVehicles,
          routeId,
          boardStopId: board.ref.stop.id,
          alightStopId: alight.ref.stop.id,
          walkToBoardSec: board.walk.durationSec,
          scheduledArrivalsSec: scheduledAtStop(board.ref.stop.id),
          fallbackRideSec: fallbackRideSec(distance, forwardStops.length - 2),
        });
        if (!leg) continue;
        const totalSec = board.walk.durationSec + leg.waitSec + leg.rideSec + alight.walk.durationSec;
        if (best && totalSec >= best.totalSec) continue;

        const busGeometry = sliceRouteByDistance(pattern.geometry.coordinates, board.ref.distAlong, alight.ref.distAlong);
        if (busGeometry.length < 2) continue;

        const boardCoords: Coordinate = { lat: board.ref.stop.lat, lon: board.ref.stop.lon };
        const alightCoords: Coordinate = { lat: alight.ref.stop.lat, lon: alight.ref.stop.lon };
        best = {
          totalSec,
          segments: [
            walkSegment(originName, board.ref.stop.name, origin, boardCoords, board.walk),
            {
              type: 'bus',
              fromName: board.ref.stop.name,
              toName: alight.ref.stop.name,
              fromCoords: boardCoords,
              toCoords: alightCoords,
              distanceMeters: 0,
              durationMin: Math.ceil(leg.rideSec / 60),
              durationSec: leg.rideSec,
              instruction: `Ride ${routeName}`,
              routeId,
              routeName,
              stopsCount: forwardStops.length,
              waitTimeMin: Math.ceil(leg.waitSec / 60),
              waitSec: leg.waitSec,
              waitSource: leg.source,
              busSegmentGeometry: { type: 'LineString', coordinates: busGeometry },
              busOrderedStopIds: forwardStops.map((s) => s.stop.id),
            },
            walkSegment(alight.ref.stop.name, destination.name, alightCoords, destCoord, alight.walk),
          ],
        };
      }
    }
  }

  const walkOnly = await walkOnlyRequest;
  const walk = directWalk;
  const bus = best ? makeJourney('bus', destination, best.segments, best.totalSec, now) : null;
  return {
    walk,
    bus,
    busUnavailable: bus ? null : !anyRouteRunning ? 'not-running' : !anyStopsInReach ? 'no-stops' : 'no-trip',
    recommended: recommendedMode(walkOnly && walk ? walkOnly.durationSec : null, best?.totalSec ?? null),
  };
}
