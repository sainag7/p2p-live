import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const n = require('../../server/gmv/normalize.cjs');
const { ROUTES, SPEED_TO_MPS } = require('../../server/gmv/config.cjs');

const EXPRESS = { id: 'P2P_EXPRESS', name: 'P2P Express' };
const NOW = Date.parse('2026-09-14T23:00:00Z');

describe('normalizeStop', () => {
  it('stringifies the id and trims the name', () => {
    expect(n.normalizeStop({ id: 42, lat: 35.9, lon: -79.05, name: 'Ambulatory Care Center ' }))
      .toEqual({ id: '42', name: 'Ambulatory Care Center', lat: 35.9, lon: -79.05 });
  });
});

describe('normalizePattern', () => {
  it('decodes the shape, sorts stops and drops consecutive duplicates', () => {
    const p = n.normalizePattern(
      { id: 7, name: 'P2P Express', shape: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
      [
        { stopSequence: 1, shapeDistanceTraveled: 400.4, stop: { id: 2 } },
        { stopSequence: 0, shapeDistanceTraveled: 0, stop: { id: 1 } },
        { stopSequence: 2, shapeDistanceTraveled: 400.4, stop: { id: 2 } },
      ]
    );
    expect(p.id).toBe(7);
    expect(p.geometry.type).toBe('LineString');
    expect(p.geometry.coordinates).toHaveLength(3);
    expect(p.lengthMeters).toBeGreaterThan(0);
    expect(p.stops).toEqual([
      { stopId: '1', sequence: 0, distAlong: 0 },
      { stopId: '2', sequence: 1, distAlong: 400.4 },
    ]);
  });
});

describe('normalizeVehicle', () => {
  const raw = {
    id: 10000000001, name: 'Bus 34', lat: 35.91, lon: -79.05, headingDegrees: 216.7, speed: 20,
    capacity: 48, passengerLoad: 0.25, lastUpdated: '2026-09-14T22:59:30Z', shapeDistanceTraveled: 812.5, pattern_id: 25545,
  };

  it('maps fields and converts speed to m/s', () => {
    const v = n.normalizeVehicle(raw, EXPRESS, NOW);
    expect(v).toMatchObject({
      id: '10000000001', name: 'Bus 34', routeId: 'P2P_EXPRESS', routeName: 'P2P Express', patternId: 25545,
      heading: 216.7, capacity: 48, load: 0.25, distAlong: 812.5, stale: false,
      lastUpdated: '2026-09-14T22:59:30.000Z', nextStopId: null, nextStopEtaSec: null, upcomingStops: [],
    });
    expect(v.speedMps).toBeCloseTo(20 * SPEED_TO_MPS, 6);
  });

  it('marks vehicles stale after 90 s without an update', () => {
    const v = n.normalizeVehicle({ ...raw, lastUpdated: '2026-09-14T22:58:00Z' }, EXPRESS, NOW);
    expect(v.stale).toBe(true);
  });

  it('tolerates missing optional fields and invalid dates', () => {
    const v = n.normalizeVehicle({ id: 5, lat: 1, lon: 2, lastUpdated: '2015-02-31T21:49:48.198Z' }, EXPRESS, NOW);
    expect(v).toMatchObject({ name: 'Bus 5', patternId: null, speedMps: null, capacity: null, load: null, lastUpdated: null, stale: false, heading: 0 });
  });

  it('does not throw on a non-string lastUpdated and normalizes it to null', () => {
    const v = n.normalizeVehicle({ id: 6, lat: 1, lon: 2, lastUpdated: 1234567890 }, EXPRESS, NOW);
    expect(v).toMatchObject({ lastUpdated: null, stale: false });
  });
});

describe('buildArrivalIndexes + attachUpcomingStops', () => {
  const groups = [{
    routeId: 'P2P_EXPRESS',
    arrivals: [
      { vehicle: { id: 9 }, stop: { id: 2 }, secondsToArrival: 400, schedulePrediction: 'false' },
      { vehicle: { id: 9 }, stop: { id: 1 }, secondsToArrival: 120.4, schedulePrediction: false },
      { vehicle: null, stop: { id: 1 }, secondsToArrival: 900, schedulePrediction: true },
      { stop: { id: 3 } },
    ],
  }];

  it('indexes by stop and by vehicle, sorted by ETA, with scheduled normalized to boolean', () => {
    const { byStop, byVehicle } = n.buildArrivalIndexes(groups);
    expect(byStop['1']).toEqual([
      { routeId: 'P2P_EXPRESS', vehicleId: '9', etaSec: 120, scheduled: false },
      { routeId: 'P2P_EXPRESS', vehicleId: null, etaSec: 900, scheduled: true },
    ]);
    expect(byStop['3']).toBeUndefined();
    expect(byVehicle['9']).toEqual([{ stopId: '1', etaSec: 120 }, { stopId: '2', etaSec: 400 }]);
  });

  it('fills a vehicle\'s next stop from the index', () => {
    const { byVehicle } = n.buildArrivalIndexes(groups);
    const v = n.attachUpcomingStops(n.normalizeVehicle({ id: 9, lat: 1, lon: 2 }, EXPRESS, NOW), byVehicle);
    expect(v.nextStopId).toBe('1');
    expect(v.nextStopEtaSec).toBe(120);
    expect(v.upcomingStops).toHaveLength(2);
  });
});

describe('messages', () => {
  it('maps GMV route ids to app ids and drops unknown routes', () => {
    const m = n.normalizeMessage({
      id: 1, name: 'Detour', text: 'Granville closed', start: '2026-09-14T00:00:00Z', end: null,
      assignments: { global: false, routes: [{ id: 6566 }, { id: 1 }], stops: [{ id: 10044065 }] },
    }, ROUTES);
    expect(m).toEqual({
      id: '1', title: 'Detour', body: 'Granville closed', global: false,
      routeIds: ['P2P_EXPRESS'], stopIds: ['10044065'], startsAt: '2026-09-14T00:00:00.000Z', endsAt: null,
    });
  });

  it('is active only between start and end', () => {
    const m = { startsAt: '2026-09-14T00:00:00.000Z', endsAt: '2026-09-15T00:00:00.000Z' };
    expect(n.isMessageActive(m, Date.parse('2026-09-14T12:00:00Z'))).toBe(true);
    expect(n.isMessageActive(m, Date.parse('2026-09-16T12:00:00Z'))).toBe(false);
    expect(n.isMessageActive({ startsAt: null, endsAt: null }, NOW)).toBe(true);
  });
});
