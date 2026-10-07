/**
 * Bus-leg math for trip planning.
 */

import type { Destination, Journey, JourneySegment, LiveVehicle, RouteId, WalkingStep } from '../types';
import { getServiceResumeLabel } from './serviceSchedule';

export const BUS_SPEED_MPS = 6;
export const DWELL_SEC_PER_STOP = 20;

/** Meters from the board stop to the alight stop along a loop pattern, wrapping past the end. */
export function rideDistanceMeters(boardDist: number, alightDist: number, lengthMeters: number): number {
  const d = alightDist - boardDist;
  return d > 0 ? d : d + lengthMeters;
}

/** Estimated ride time when no live prediction covers both stops. */
export function fallbackRideSec(distanceMeters: number, intermediateStops: number): number {
  return Math.ceil(distanceMeters / BUS_SPEED_MPS + Math.max(0, intermediateStops) * DWELL_SEC_PER_STOP);
}

export interface BusLegEstimate {
  /** Seconds waiting at the board stop after walking there. */
  waitSec: number;
  rideSec: number;
  source: 'live' | 'scheduled';
  vehicleId: string | null;
}

export interface BusLegInput {
  vehicles: LiveVehicle[];
  routeId: RouteId;
  boardStopId: string;
  alightStopId: string;
  /** Seconds until the rider reaches the board stop. */
  walkToBoardSec: number;
  /** Non-live arrivals at the board stop (seconds from now), used when no live bus fits. */
  scheduledArrivalsSec: number[];
  fallbackRideSec: number;
}

/** Earliest live bus the rider can catch (ride time from its own predictions), else the next scheduled arrival. */
export function estimateBusLeg(input: BusLegInput): BusLegEstimate | null {
  const { vehicles, routeId, boardStopId, alightStopId, walkToBoardSec, scheduledArrivalsSec } = input;
  let best: BusLegEstimate | null = null;
  let bestBoardEta = Infinity;

  for (const v of vehicles) {
    if (v.routeId !== routeId || v.stale) continue;
    const board = v.upcomingStops.find((s) => s.stopId === boardStopId && s.etaSec >= walkToBoardSec);
    if (!board) continue;
    const alight = v.upcomingStops.find((s) => s.stopId === alightStopId && s.etaSec > board.etaSec);
    if (board.etaSec < bestBoardEta || (board.etaSec === bestBoardEta && alight)) {
      bestBoardEta = board.etaSec;
      best = {
        waitSec: board.etaSec - walkToBoardSec,
        rideSec: alight ? alight.etaSec - board.etaSec : input.fallbackRideSec,
        source: 'live',
        vehicleId: v.id,
      };
    }
  }
  if (best) return best;

  const next = [...scheduledArrivalsSec].sort((a, b) => a - b).find((s) => s >= walkToBoardSec);
  if (next == null) return null;
  return { waitSec: next - walkToBoardSec, rideSec: input.fallbackRideSec, source: 'scheduled', vehicleId: null };
}

export type TripMode = 'walk' | 'bus';
export type BusUnavailableReason = 'not-running' | 'no-stops' | 'no-trip';

/** Both ways to make a trip; the bus is offered even when walking is faster. */
export interface TripOptions {
  walk: Journey | null;
  bus: Journey | null;
  busUnavailable: BusUnavailableReason | null;
  recommended: TripMode;
}

/** A planned trip from the rider's location: both options, the one they picked, and where to (for refresh). */
export interface PlannedTrip {
  options: TripOptions;
  mode: TripMode;
  destination: Destination;
}

/** Walking wins near-ties: no wait and no risk of missing the bus. */
export const WALK_ONLY_MARGIN_SEC = 90;
/** Arrive at the stop about a minute before the bus. */
const BOARD_BUFFER_SEC = 60;

export function recommendedMode(walkSec: number | null, busSec: number | null): TripMode {
  if (busSec == null) return 'walk';
  if (walkSec == null) return 'bus';
  return walkSec <= busSec + WALK_ONLY_MARGIN_SEC ? 'walk' : 'bus';
}

const segmentSec = (s: JourneySegment) => s.durationSec ?? s.durationMin * 60;
export const journeySec = (j: Journey) => (j.arrivalTime.getTime() - j.startTime.getTime()) / 1000;
export const walkingMeters = (j: Journey) => j.segments.filter(s => s.type === 'walk').reduce((m, s) => m + s.distanceMeters, 0);

/** Why there's no bus option, shown under the greyed-out Bus card. */
export function busUnavailableMessage(reason: BusUnavailableReason | null): string {
  if (reason === 'not-running') return `Buses aren't running right now. Service starts at ${getServiceResumeLabel()}.`;
  if (reason === 'no-stops') return 'No bus stops are within a 15-minute walk of your start or destination.';
  return 'No bus trip fits this route right now.';
}

export interface BusTripTimes {
  /** Whole minutes until the rider should leave, from `now`; 0 means go now. */
  leaveInMin: number;
  leaveAt: Date;
  boardAt: Date;
  alightAt: Date;
  arriveAt: Date;
  walkToStopSec: number;
  /** Wait at the stop when leaving at `leaveAt`. */
  waitAtStopSec: number;
  rideSec: number;
  finalWalkSec: number;
  /** The planned bus has probably already left the board stop. */
  missed: boolean;
}

/** Clock times for a bus journey, planned at `journey.startTime`. */
export function busTripTimes(journey: Journey, now = new Date()): BusTripTimes | null {
  const i = journey.segments.findIndex(s => s.type === 'bus');
  if (i < 0) return null;
  const bus = journey.segments[i];
  const walkToStopSec = journey.segments.slice(0, i).reduce((t, s) => t + segmentSec(s), 0);
  const waitSec = bus.waitSec ?? (bus.waitTimeMin ?? 0) * 60;
  const rideSec = segmentSec(bus);
  const finalWalkSec = journey.segments.slice(i + 1).reduce((t, s) => t + segmentSec(s), 0);
  const leaveSec = Math.max(0, waitSec - BOARD_BUFFER_SEC);
  const at = (sec: number) => new Date(journey.startTime.getTime() + sec * 1000);
  const leaveAt = at(leaveSec), boardAt = at(walkToStopSec + waitSec);
  return {
    leaveInMin: Math.max(0, Math.floor((leaveAt.getTime() - now.getTime()) / 60000)),
    leaveAt, boardAt,
    alightAt: at(walkToStopSec + waitSec + rideSec),
    arriveAt: at(walkToStopSec + waitSec + rideSec + finalWalkSec),
    walkToStopSec, waitAtStopSec: waitSec - leaveSec, rideSec, finalWalkSec,
    missed: boardAt.getTime() <= now.getTime(),
  };
}

/** Paths without a street name: turns onto these are folded into the step before. */
const UNNAMED_WAY = /\b(walkway|crosswalk|sidewalk|footway|path|pedestrian|steps|stairs)\b/i;
/** An unnamed stretch this long is worth its own step. */
const LONG_STRETCH_M = 150;
const streetName = (instruction: string) => {
  const name = /\b(?:onto|on|along)\s+(?:the\s+)?(.+?)\.?$/i.exec(instruction)?.[1];
  return name && !UNNAMED_WAY.test(name) ? name.toLowerCase() : null;
};

/**
 * Just the main walking directions: the first step, turns onto named streets and long
 * stretches. Walkway/crosswalk turns, "Continue" and staying on the same street fold into
 * the step before (distance added); zero-length arrival steps are dropped.
 */
export function mainWalkingSteps(steps: WalkingStep[] = []): WalkingStep[] {
  const out: WalkingStep[] = [];
  for (const step of steps) {
    if (step.distanceMeters < 8) continue;
    const prev = out[out.length - 1];
    const street = streetName(step.instruction);
    const keep = !prev || step.distanceMeters >= LONG_STRETCH_M || (street != null && street !== streetName(prev.instruction));
    if (keep) out.push({ ...step });
    else { prev.distanceMeters += step.distanceMeters; prev.durationSec += step.durationSec; }
  }
  return out;
}
