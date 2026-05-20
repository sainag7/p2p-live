/**
 * Multimodal routing: Walk → Bus → Walk using Mapbox walking directions and route geometry.
 * Compares walk-only vs bus-assisted and returns the best journey with geometries and steps.
 */

import type { Coordinate, Destination, Journey, JourneySegment, WalkingStep } from '../types';
import type { LineStringGeometry } from '../types';
import { findKNearestStops } from './geo';
import { type RouteConfig, type RouteStopConfig } from '../data/routeConfig';
import { createRouteInterpolator, haversineMeters, projectPointToRoute, sliceRouteByDistance } from './routeInterpolation';
import type { LngLat } from './routeInterpolation';

const BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_OPS_API_URL) || '';
const K_NEAREST = 6;
const MAX_WALK_METERS = 1200;
const MAX_WALK_DURATION_SEC = 15 * 60;
const WALK_ONLY_MARGIN_SEC = 90;
const BUS_SPEED_MPS = 6;
const DWELL_SEC_PER_STOP = 20;

export interface WalkDirectionsResult {
  durationSec: number;
  distanceMeters: number;
  geometry: { type: string; coordinates: [number, number][] };
  steps: { instruction: string; distanceMeters: number; durationSec: number }[];
}

export async function getWalkDirections(from: Coordinate, to: Coordinate): Promise<WalkDirectionsResult | null> {
  const fromStr = `${from.lon},${from.lat}`;
  const toStr = `${to.lon},${to.lat}`;
  try {
    const res = await fetch(`${BASE}/api/mapbox/directions/walk?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`);
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

export async function getRouteGeometry(
  routeId: string,
  coords?: [number, number][]
): Promise<LngLat[] | null> {
  try {
    const useCoords = Array.isArray(coords) && coords.length >= 2;
    const res = await fetch(`${BASE}/api/mapbox/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(useCoords ? { routeId, coords } : { routeId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const out = data.geometry?.coordinates;
    if (!Array.isArray(out) || out.length < 2) return null;
    return out;
  } catch {
    return null;
  }
}

/** Ordered stops from board index to alight index (forward, with wrap). */
function orderedStopsBetween(
  stops: RouteStopConfig[],
  boardIndex: number,
  alightIndex: number
): RouteStopConfig[] {
  const n = stops.length;
  if (n === 0) return [];
  if (boardIndex === alightIndex) return [stops[boardIndex]];
  const out: RouteStopConfig[] = [];
  let i = boardIndex;
  while (true) {
    out.push(stops[i]);
    if (i === alightIndex) break;
    i = (i + 1) % n;
    if (out.length > n) break;
  }
  return out;
}

/** Bus travel time in seconds: distance/speed + dwell * (intermediate stops). */
function busTravelTimeSeconds(
  routeCoords: LngLat[],
  boardCoord: LngLat,
  alightCoord: LngLat,
  boardIndex: number,
  alightIndex: number,
  numStopsInSegment: number
): number {
  const { distanceAlong: dBoard } = projectPointToRoute(routeCoords, boardCoord);
  const { distanceAlong: dAlight } = projectPointToRoute(routeCoords, alightCoord);
  let distMeters: number;
  const total = createRouteInterpolator(routeCoords)?.totalLengthMeters ?? 0;
  if (total <= 0) return 0;
  if (dAlight >= dBoard) {
    distMeters = dAlight - dBoard;
  } else {
    distMeters = (total - dBoard) + dAlight;
  }
  const travelSec = distMeters / BUS_SPEED_MPS;
  const intermediateStops = Math.max(0, numStopsInSegment - 2);
  const dwellSec = intermediateStops * DWELL_SEC_PER_STOP;
  return Math.ceil(travelSec + dwellSec);
}

/** Slice route geometry from board to alight (forward, with wrap). */
function sliceBusGeometry(
  routeCoords: LngLat[],
  boardCoord: LngLat,
  alightCoord: LngLat
): [number, number][] {
  const { distanceAlong: dBoard } = projectPointToRoute(routeCoords, boardCoord);
  const { distanceAlong: dAlight } = projectPointToRoute(routeCoords, alightCoord);
  const total = createRouteInterpolator(routeCoords)?.totalLengthMeters ?? 0;
  if (total <= 0) return [];
  const slice = sliceRouteByDistance(routeCoords, dBoard, dAlight);
  return slice;
}

export interface MultimodalInput {
  origin: Coordinate;
  destination: Destination;
}

export async function computeMultimodalRoute(
  input: MultimodalInput,
  routeConfigs: RouteConfig[]
): Promise<Journey> {
  const { origin, destination } = input;
  const destCoord: Coordinate = { lat: destination.lat, lon: destination.lon };

  const now = new Date();

  const walkOnly = await getWalkDirections(origin, destCoord);
  const walkOnlyDurationSec = walkOnly ? walkOnly.durationSec : Infinity;
  const walkOnlyDurationMin = Math.ceil(walkOnlyDurationSec / 60);

  const routeGeometries: Record<string, LngLat[]> = {};
  for (const config of routeConfigs) {
    const coords = config.stops.map((s) => s.coord);
    const geom = await getRouteGeometry(config.routeId, coords);
    if (geom) routeGeometries[config.routeId] = geom;
  }

  let bestTotalSec = walkOnlyDurationSec;
  let bestSegments: JourneySegment[] = [];
  let bestIsWalkOnly = true;

  if (walkOnly && walkOnly.geometry) {
    bestSegments = [
      {
        type: 'walk',
        fromName: 'Current Location',
        toName: destination.name,
        fromCoords: origin,
        toCoords: destCoord,
        distanceMeters: walkOnly.distanceMeters,
        durationMin: walkOnlyDurationMin,
        instruction: `Walk to ${destination.name}`,
        geometry: walkOnly.geometry as LineStringGeometry,
        steps: walkOnly.steps as WalkingStep[],
      },
    ];
  }

  for (const config of routeConfigs) {
    const routeCoords = routeGeometries[config.routeId];
    if (!routeCoords) continue;

    const stopsAsStop = config.stops.map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.coord[1],
      lon: s.coord[0],
    }));

    const nearOrigin = findKNearestStops(origin, stopsAsStop, K_NEAREST);
    const nearDest = findKNearestStops(destCoord, stopsAsStop, K_NEAREST);

    const boardCandidates: { stop: RouteStopConfig; durationSec: number; distanceMeters: number }[] = [];
    for (const { stop, distanceMeters } of nearOrigin) {
      if (distanceMeters > MAX_WALK_METERS) continue;
      // Stop from findKNearestStops is { id, name, lat, lon } (no coord); use lat/lon
      const stopCoord = { lat: stop.lat, lon: stop.lon };
      const walk = await getWalkDirections(origin, stopCoord);
      if (!walk || walk.durationSec > MAX_WALK_DURATION_SEC) continue;
      const routeStop = config.stops.find((s) => s.id === stop.id)!;
      boardCandidates.push({
        stop: routeStop,
        durationSec: walk.durationSec,
        distanceMeters: walk.distanceMeters,
      });
    }

    const alightCandidates: { stop: RouteStopConfig; durationSec: number; distanceMeters: number }[] = [];
    for (const { stop, distanceMeters } of nearDest) {
      if (distanceMeters > MAX_WALK_METERS) continue;
      const stopCoord = { lat: stop.lat, lon: stop.lon };
      const walk = await getWalkDirections(stopCoord, destCoord);
      if (!walk || walk.durationSec > MAX_WALK_DURATION_SEC) continue;
      const routeStop = config.stops.find((s) => s.id === stop.id)!;
      alightCandidates.push({
        stop: routeStop,
        durationSec: walk.durationSec,
        distanceMeters: walk.distanceMeters,
      });
    }

    for (const board of boardCandidates) {
      for (const alight of alightCandidates) {
        const boardIndex = board.stop.index;
        const alightIndex = alight.stop.index;
        if (board.stop.id === alight.stop.id) continue;

        let forwardStops: RouteStopConfig[];
        let busDurationSec: number;
        if (alightIndex >= boardIndex) {
          forwardStops = orderedStopsBetween(config.stops, boardIndex, alightIndex);
          busDurationSec = busTravelTimeSeconds(
            routeCoords,
            board.stop.coord,
            alight.stop.coord,
            boardIndex,
            alightIndex,
            forwardStops.length
          );
        } else {
          forwardStops = orderedStopsBetween(config.stops, boardIndex, alightIndex);
          busDurationSec = busTravelTimeSeconds(
            routeCoords,
            board.stop.coord,
            alight.stop.coord,
            boardIndex,
            alightIndex,
            forwardStops.length
          );
        }

        const totalSec = board.durationSec + busDurationSec + alight.durationSec;
        if (totalSec >= bestTotalSec) continue;

        const walkToBoard = await getWalkDirections(origin, { lat: board.stop.coord[1], lon: board.stop.coord[0] });
        const walkFromAlight = await getWalkDirections({ lat: alight.stop.coord[1], lon: alight.stop.coord[0] }, destCoord);
        if (!walkToBoard || !walkFromAlight) continue;

        const busGeometry = sliceBusGeometry(routeCoords, board.stop.coord, alight.stop.coord);
        if (busGeometry.length < 2) continue;

        bestTotalSec = totalSec;
        bestIsWalkOnly = false;
        bestSegments = [
          {
            type: 'walk',
            fromName: 'Current Location',
            toName: board.stop.name,
            fromCoords: origin,
            toCoords: { lat: board.stop.coord[1], lon: board.stop.coord[0] },
            distanceMeters: walkToBoard.distanceMeters,
            durationMin: Math.ceil(walkToBoard.durationSec / 60),
            instruction: `Walk to ${board.stop.name}`,
            geometry: walkToBoard.geometry as LineStringGeometry,
            steps: walkToBoard.steps as WalkingStep[],
          },
          {
            type: 'bus',
            fromName: board.stop.name,
            toName: alight.stop.name,
            fromCoords: { lat: board.stop.coord[1], lon: board.stop.coord[0] },
            toCoords: { lat: alight.stop.coord[1], lon: alight.stop.coord[0] },
            distanceMeters: 0,
            durationMin: Math.ceil(busDurationSec / 60),
            instruction: `Ride ${config.routeName}`,
            routeId: config.routeId.toLowerCase().replace('_', '-'),
            routeName: config.routeName,
            stopsCount: forwardStops.length,
            waitTimeMin: 0,
            busSegmentGeometry: { type: 'LineString', coordinates: busGeometry },
            busOrderedStopIds: forwardStops.map((s) => s.id),
          },
          {
            type: 'walk',
            fromName: alight.stop.name,
            toName: destination.name,
            fromCoords: { lat: alight.stop.coord[1], lon: alight.stop.coord[0] },
            toCoords: destCoord,
            distanceMeters: walkFromAlight.distanceMeters,
            durationMin: Math.ceil(walkFromAlight.durationSec / 60),
            instruction: `Walk to ${destination.name}`,
            geometry: walkFromAlight.geometry as LineStringGeometry,
            steps: walkFromAlight.steps as WalkingStep[],
          },
        ];
      }
    }
  }

  if (walkOnly && walkOnly.geometry && walkOnlyDurationSec <= bestTotalSec + WALK_ONLY_MARGIN_SEC) {
    bestTotalSec = walkOnlyDurationSec;
    bestSegments = [
      {
        type: 'walk',
        fromName: 'Current Location',
        toName: destination.name,
        fromCoords: origin,
        toCoords: destCoord,
        distanceMeters: walkOnly.distanceMeters,
        durationMin: walkOnlyDurationMin,
        instruction: `Walk to ${destination.name}`,
        geometry: walkOnly.geometry as LineStringGeometry,
        steps: walkOnly.steps as WalkingStep[],
      },
    ];
  }

  const totalDurationMin = Math.ceil(bestTotalSec / 60);
  const arrivalTime = new Date(now.getTime() + bestTotalSec * 1000);

  return {
    id: `journey-${Date.now()}`,
    destination,
    totalDurationMin,
    segments: bestSegments,
    startTime: now,
    arrivalTime,
  };
}
