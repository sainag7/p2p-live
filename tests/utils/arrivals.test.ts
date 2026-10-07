import { describe, it, expect } from 'vitest';
import { getStopArrivals, measuredLapSec, nextArrivalsByRoute } from '../../utils/arrivals';
import { makeNetwork, makeSnapshot } from '../fixtures/transit';

const network = makeNetwork();
const NINE_PM_MONDAY = new Date(2026, 8, 14, 21, 0);
const NOON = new Date(2026, 8, 14, 12, 0);

describe('getStopArrivals', () => {
  it('returns live arrivals with route names', () => {
    const out = getStopArrivals({ stopId: 'b', snapshot: makeSnapshot(), status: 'live', network, now: NINE_PM_MONDAY });
    expect(out).toEqual([{ routeId: 'P2P_EXPRESS', routeName: 'P2P Express', etaSec: 90, source: 'live', vehicleId: 'v1' }]);
  });

  it('labels GMV schedule predictions as scheduled', () => {
    const snapshot = makeSnapshot({
      arrivalsByStop: { b: [{ routeId: 'P2P_EXPRESS', vehicleId: null, etaSec: 600, scheduled: true }] },
    });
    const out = getStopArrivals({ stopId: 'b', snapshot, status: 'live', network, now: NINE_PM_MONDAY });
    expect(out[0]).toMatchObject({ source: 'scheduled', vehicleId: null, etaSec: 600 });
  });

  it('falls back to the timetable when the stop has no live arrivals', () => {
    const out = getStopArrivals({ stopId: 'e', snapshot: makeSnapshot(), status: 'live', network, now: NINE_PM_MONDAY });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((a) => a.routeId === 'BAITY_HILL' && a.source === 'scheduled' && a.etaSec % 60 === 0)).toBe(true);
  });

  it('ignores live data when the client status is unavailable', () => {
    const out = getStopArrivals({ stopId: 'b', snapshot: makeSnapshot(), status: 'unavailable', network, now: NINE_PM_MONDAY });
    expect(out.every((a) => a.source === 'scheduled' && a.routeId === 'P2P_EXPRESS')).toBe(true);
  });

  it('returns nothing outside service hours without live data', () => {
    expect(getStopArrivals({ stopId: 'b', snapshot: null, status: 'no-service', network, now: NOON })).toEqual([]);
  });

  it('respects the limit', () => {
    const out = getStopArrivals({ stopId: 'e', snapshot: null, status: 'unavailable', network, now: NINE_PM_MONDAY, limit: 2 });
    expect(out).toHaveLength(2);
  });
});

describe('nextArrivalsByRoute', () => {
  const row = (a: { routeId: string; etaSec: number; source: string }) => `${a.routeId}:${a.etaSec}:${a.source}`;
  it('lists two per route: a single live bus comes round again one headway later', () => {
    // Stop c: one live Express bus at 5 min (next pass +20 min); Baity has no live data, so its timetable.
    const out = nextArrivalsByRoute({ stopId: 'c', snapshot: makeSnapshot(), status: 'live', network, now: NINE_PM_MONDAY });
    expect(out.map(row)).toEqual([
      'BAITY_HILL:0:scheduled', 'BAITY_HILL:1800:scheduled',
      'P2P_EXPRESS:300:live', 'P2P_EXPRESS:1500:scheduled',
    ]);
  });
  it('uses the bus\'s measured lap when the feed predicts it twice somewhere', () => {
    // v1 passes stop b twice, 35 min apart; at stop c only once, so its next pass is +35 min.
    const snapshot = makeSnapshot({ arrivalsByStop: {
      b: [90, 2190].map((etaSec) => ({ routeId: 'P2P_EXPRESS' as const, vehicleId: 'v1', etaSec, scheduled: false })),
      c: [{ routeId: 'P2P_EXPRESS', vehicleId: 'v1', etaSec: 300, scheduled: false }],
    } });
    expect(measuredLapSec(snapshot, 'P2P_EXPRESS')).toBe(2100);
    expect(measuredLapSec(snapshot, 'BAITY_HILL')).toBeNull();
    expect(nextArrivalsByRoute({ stopId: 'c', snapshot, status: 'live', network, now: NINE_PM_MONDAY }).filter((a) => a.routeId === 'P2P_EXPRESS').map(row))
      .toEqual(['P2P_EXPRESS:300:live', 'P2P_EXPRESS:2400:scheduled']);
  });
  it('keeps the first two live arrivals when the feed has them', () => {
    const snapshot = makeSnapshot({ arrivalsByStop: { b: [300, 1500, 2700].map((etaSec) => ({ routeId: 'P2P_EXPRESS' as const, vehicleId: 'v1', etaSec, scheduled: false })) } });
    expect(nextArrivalsByRoute({ stopId: 'b', snapshot, status: 'live', network, now: NINE_PM_MONDAY }).map(row))
      .toEqual(['P2P_EXPRESS:300:live', 'P2P_EXPRESS:1500:live']);
  });
  it('does not estimate a pass after service ends', () => {
    const lateNight = new Date(2026, 8, 15, 2, 50);
    const snapshot = makeSnapshot({ arrivalsByStop: { b: [{ routeId: 'P2P_EXPRESS', vehicleId: 'v1', etaSec: 300, scheduled: false }] } });
    expect(nextArrivalsByRoute({ stopId: 'b', snapshot, status: 'live', network, now: lateNight }).map(row)).toEqual(['P2P_EXPRESS:300:live']);
  });
  it('returns nothing outside service hours without live data', () => {
    expect(nextArrivalsByRoute({ stopId: 'c', snapshot: null, status: 'no-service', network, now: NOON })).toEqual([]);
  });
});
