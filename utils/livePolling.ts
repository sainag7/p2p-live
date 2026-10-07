import type { ClientLiveStatus, LiveSnapshot, LiveVehicle } from '../types';

export const POLL_INTERVAL_MS = 6000;
/** After this long without a successful snapshot the client treats live data as unavailable. */
export const CLIENT_STALE_AFTER_MS = 30000;

const BACKOFF_MS = [POLL_INTERVAL_MS, 12000, 30000];

export function nextPollDelayMs(consecutiveFailures: number): number {
  return BACKOFF_MS[Math.min(Math.max(consecutiveFailures, 0), BACKOFF_MS.length - 1)];
}

export function deriveClientStatus(
  snapshot: LiveSnapshot | null,
  receivedAt: number | null,
  nowMs: number,
  attempted: boolean
): ClientLiveStatus {
  if (!snapshot || receivedAt == null) return attempted ? 'unavailable' : 'loading';
  if (nowMs - receivedAt > CLIENT_STALE_AFTER_MS) return 'unavailable';
  return snapshot.status;
}

export function visibleVehicles(snapshot: LiveSnapshot | null, status: ClientLiveStatus): LiveVehicle[] {
  if (!snapshot || (status !== 'live' && status !== 'degraded')) return [];
  return snapshot.vehicles;
}
