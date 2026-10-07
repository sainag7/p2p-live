/** Helpers for the rider's live GPS location (see hooks/useLiveLocation.ts). */
import type { Coordinate } from '../types';
import { getDistanceMeters } from './geo';

export interface LocationReading extends Coordinate {
  /** Meters, as reported by the phone (95% confidence radius). */
  accuracy: number;
  /** Client clock, ms. */
  time: number;
}

/** GPS drifts a few meters while standing still; smaller moves don't redraw the dot. */
export const MIN_MOVE_METERS = 3;

/** Whether a reading should replace the shown location: it moved, or it is clearly more precise. */
export function isNewSpot(shown: LocationReading | null, next: LocationReading): boolean {
  if (!shown) return true;
  return getDistanceMeters(shown, next) >= MIN_MOVE_METERS || next.accuracy <= shown.accuracy * 0.8;
}
