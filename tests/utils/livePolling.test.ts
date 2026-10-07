import { describe, it, expect } from 'vitest';
import { deriveClientStatus, nextPollDelayMs, visibleVehicles } from '../../utils/livePolling';
import { makeSnapshot } from '../fixtures/transit';

describe('nextPollDelayMs', () => {
  it('polls every 6 s and backs off to 12 s then 30 s on failures', () => {
    expect(nextPollDelayMs(0)).toBe(6000);
    expect(nextPollDelayMs(1)).toBe(12000);
    expect(nextPollDelayMs(2)).toBe(30000);
    expect(nextPollDelayMs(9)).toBe(30000);
  });
});

describe('deriveClientStatus', () => {
  const snap = makeSnapshot({ status: 'no-service' });

  it('is loading before the first attempt and unavailable after a failed one', () => {
    expect(deriveClientStatus(null, null, 1000, false)).toBe('loading');
    expect(deriveClientStatus(null, null, 1000, true)).toBe('unavailable');
  });

  it('passes the server status through while the snapshot is fresh', () => {
    expect(deriveClientStatus(snap, 1000, 20_000, true)).toBe('no-service');
  });

  it('becomes unavailable when the last snapshot is older than 30 s', () => {
    expect(deriveClientStatus(snap, 1000, 31_001, true)).toBe('unavailable');
  });
});

describe('visibleVehicles', () => {
  it('shows vehicles only for live or degraded data', () => {
    const snap = makeSnapshot();
    expect(visibleVehicles(snap, 'live')).toHaveLength(1);
    expect(visibleVehicles(snap, 'degraded')).toHaveLength(1);
    expect(visibleVehicles(snap, 'unavailable')).toEqual([]);
    expect(visibleVehicles(null, 'live')).toEqual([]);
  });
});
