/**
 * Map bus motion between live snapshots. Each bus is drawn at a distance along its pattern line
 * that chases where the feed says it is now (its last report, moved on at the reported speed).
 * A critically damped spring does the chasing, so buses glide at a steady pace and speed up or
 * slow down gently when a new report lands, instead of jumping to it.
 */

import type { LiveVehicle } from '../types';
import { bearingBetween, type RouteInterpolator } from './routeInterpolation';

/** A bus keeps its reported speed for this long after its report... */
export const EXTRAPOLATE_SEC = 10;
/** ...then eases to a stop over this long if no newer report arrives. */
export const COAST_SEC = 4;
/** Spring rate (1/s): higher sticks closer to the feed, lower glides more. */
export const FOLLOW_RATE = 1.5;
/** Farther than this from the feed position, a bus jumps there instead of racing along the route. */
export const SNAP_METERS = 400;
/** A bus drawn a little ahead of the feed waits for it rather than rolling backward. */
export const HOLD_METERS = 30;
/** Seconds for a turn to mostly settle. */
export const TURN_SEC = 0.35;
/** Longer frames (a slow or throttled page) are split into steps this short, so the spring stays accurate. */
export const MAX_STEP_SEC = 0.05;

export interface BusMotion {
  patternId: number | null;
  /** Meters along the pattern line; null when drawn at the raw reported position. */
  dist: number | null;
  /** Meters per second along the line. */
  speed: number;
  lon: number;
  lat: number;
  bearing: number;
}

/** Meters covered `ageSec` after a report at `speed`: straight on, then an easy stop. */
export function travelledSince(speed: number, ageSec: number): number {
  const t = Math.max(0, ageSec);
  if (t <= EXTRAPOLATE_SEC) return speed * t;
  const coast = Math.min(t - EXTRAPOLATE_SEC, COAST_SEC);
  return speed * (EXTRAPOLATE_SEC + coast - coast * coast / (2 * COAST_SEC));
}

/** Seconds since the vehicle's own GPS report. `clockOffsetMs` is the client clock minus the
 * server clock; without it (or a report time) this falls back to the snapshot's arrival. */
export function reportAgeSec(v: LiveVehicle, nowMs: number, clockOffsetMs: number | null, receivedAtMs: number | null): number {
  const reported = v.lastUpdated ? Date.parse(v.lastUpdated) : NaN;
  if (clockOffsetMs != null && Number.isFinite(reported)) return Math.max(0, (nowMs - clockOffsetMs - reported) / 1000);
  return receivedAtMs == null ? 0 : Math.max(0, (nowMs - receivedAtMs) / 1000);
}

/** The feed's position as-is, for reduced motion. */
export function reportedPosition(v: LiveVehicle): BusMotion {
  return { patternId: v.patternId, dist: null, speed: 0, lon: v.lon, lat: v.lat, bearing: v.heading };
}

/** Signed degrees to turn from `from` to `to` the short way, in [-180, 180). */
const turnBy = (from: number, to: number) => ((to - from) % 360 + 540) % 360 - 180;
/** Signed meters from `from` to `to` around a loop of `length`, in [-length/2, length/2). */
const loopGap = (gap: number, length: number) => ((gap % length) + length * 1.5) % length - length / 2;

/** Advance a drawn bus by one frame of `dtSec`; `ageSec` is the report's age at the end of the frame. */
export function stepBus(prev: BusMotion | null, v: LiveVehicle, route: RouteInterpolator | null, ageSec: number, dtSec: number): BusMotion {
  if (prev && dtSec > MAX_STEP_SEC) {
    const steps = Math.ceil(dtSec / MAX_STEP_SEC), step = dtSec / steps;
    let m = prev;
    for (let i = steps - 1; i >= 0; i--) m = stepOnce(m, v, route, ageSec - i * step, step);
    return m;
  }
  return stepOnce(prev, v, route, ageSec, dtSec);
}

function stepOnce(prev: BusMotion | null, v: LiveVehicle, route: RouteInterpolator | null, ageSec: number, dtSec: number): BusMotion {
  const turn = (bearing: number) => prev
    ? (prev.bearing + turnBy(prev.bearing, bearing) * (1 - Math.exp(-dtSec / TURN_SEC)) + 360) % 360
    : bearing;

  if (!route || route.totalLengthMeters <= 0 || v.stale || v.distAlong == null) {
    // No line to follow: glide straight to the reported position.
    const k = prev ? 1 - Math.exp(-dtSec * FOLLOW_RATE) : 1;
    return {
      patternId: v.patternId, dist: null, speed: 0,
      lon: prev ? prev.lon + (v.lon - prev.lon) * k : v.lon,
      lat: prev ? prev.lat + (v.lat - prev.lat) * k : v.lat,
      bearing: turn(v.heading),
    };
  }

  const length = route.totalLengthMeters;
  const reported = Math.max(v.speedMps ?? 0, 0);
  const target = v.distAlong + travelledSince(reported, ageSec);
  const gap = prev?.dist != null && prev.patternId === v.patternId ? loopGap(target - prev.dist, length) : null;
  let dist: number, speed: number;
  if (gap == null || Math.abs(gap) > SNAP_METERS) {
    // Start where a bus already following at this speed would be.
    speed = reported;
    dist = target - 2 * reported / FOLLOW_RATE;
  } else {
    speed = prev!.speed + (FOLLOW_RATE ** 2 * gap - 2 * FOLLOW_RATE * prev!.speed) * dtSec;
    if (speed < 0 && gap > -HOLD_METERS) speed = 0;
    dist = prev!.dist! + speed * dtSec;
  }
  dist = ((dist % length) + length) % length;
  const [lon, lat] = route.pointAt(dist);
  // Heading of the road just around the bus, so it turns through corners instead of snapping.
  return { patternId: v.patternId, dist, speed, lon, lat, bearing: turn(bearingBetween(route.pointAt(dist - 5), route.pointAt(dist + 10))) };
}
