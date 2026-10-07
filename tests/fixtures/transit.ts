import type { LiveSnapshot, LiveVehicle, TransitNetwork } from '../../types';

/** A small L-shaped line near campus, [lng, lat]. */
export const LINE: [number, number][] = [
  [-79.05, 35.9],
  [-79.04, 35.9],
  [-79.04, 35.91],
  [-79.05, 35.91],
];

export function makeNetwork(): TransitNetwork {
  return {
    routes: [
      {
        id: 'P2P_EXPRESS', gmvId: 6566, name: 'P2P Express', shortName: 'Express', color: '#383FFF', textColor: '#FFFFFF',
        defaultPatternId: 10,
        patterns: [
          {
            id: 10, name: 'P2P Express', geometry: { type: 'LineString', coordinates: LINE }, lengthMeters: 3000,
            stops: [
              { stopId: 'a', sequence: 0, distAlong: 0 },
              { stopId: 'b', sequence: 1, distAlong: 900 },
              { stopId: 'c', sequence: 2, distAlong: 2000 },
            ],
          },
          {
            id: 11, name: 'Football - P2P Express', geometry: { type: 'LineString', coordinates: LINE }, lengthMeters: 3000,
            stops: [
              { stopId: 'a', sequence: 0, distAlong: 0 },
              { stopId: 'd', sequence: 1, distAlong: 2500 },
            ],
          },
        ],
      },
      {
        id: 'BAITY_HILL', gmvId: 6564, name: 'Baity Hill', shortName: 'BH', color: '#AD42FF', textColor: '#FFFFFF',
        defaultPatternId: 20,
        patterns: [
          {
            id: 20, name: 'Baity Hill', geometry: { type: 'LineString', coordinates: LINE }, lengthMeters: 2500,
            stops: [
              { stopId: 'c', sequence: 0, distAlong: 0 },
              { stopId: 'e', sequence: 1, distAlong: 1200 },
            ],
          },
        ],
      },
    ],
    stops: [
      { id: 'a', name: 'Stop A', lat: 35.9, lon: -79.05 },
      { id: 'b', name: 'Stop B', lat: 35.9, lon: -79.04 },
      { id: 'c', name: 'Stop C', lat: 35.91, lon: -79.04 },
      { id: 'd', name: 'Stop D', lat: 35.91, lon: -79.05 },
      { id: 'e', name: 'Stop E', lat: 35.905, lon: -79.045 },
    ],
  };
}

export function makeVehicle(overrides: Partial<LiveVehicle> = {}): LiveVehicle {
  return {
    id: 'v1', name: 'Bus 1', routeId: 'P2P_EXPRESS', routeName: 'P2P Express', patternId: 10,
    lat: 35.9, lon: -79.045, heading: 90, speedMps: 5, distAlong: 450, capacity: 40, load: 0.5,
    lastUpdated: '2026-09-14T23:00:00.000Z', stale: false,
    nextStopId: 'b', nextStopEtaSec: 90,
    upcomingStops: [{ stopId: 'b', etaSec: 90 }, { stopId: 'c', etaSec: 300 }],
    ...overrides,
  };
}

export function makeSnapshot(overrides: Partial<LiveSnapshot> = {}): LiveSnapshot {
  return {
    fetchedAt: '2026-09-14T23:00:05.000Z',
    status: 'live',
    activePatternIds: { P2P_EXPRESS: 10 },
    vehicles: [makeVehicle()],
    arrivalsByStop: {
      b: [{ routeId: 'P2P_EXPRESS', vehicleId: 'v1', etaSec: 90, scheduled: false }],
      c: [{ routeId: 'P2P_EXPRESS', vehicleId: 'v1', etaSec: 300, scheduled: false }],
    },
    messages: [],
    ...overrides,
  };
}
