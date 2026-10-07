import { describe, it, expect } from 'vitest';
import { mergeNetworkStops, mergeSnapshotStops, withDisplayNames } from '../../utils/transitApi';
import { displayStopName } from '../../data/stopDisplayNames';
import { routeIdFromName } from '../../data/routes';
import { makeNetwork, makeSnapshot, makeVehicle } from '../fixtures/transit';

describe('stop display names', () => {
  it('uses the friendly name when one is defined', () => {
    expect(displayStopName('10044083', 'Williamson Lot')).toBe('Smith Center Stadium (Williamson Lot)');
  });
  it('uses the short names for renamed stops', () => {
    expect(displayStopName('10043119', 'Horton')).toBe('Hinton James/Horton Residence Hall');
    expect(displayStopName('10044086', 'Craige')).toBe('Craige Parking Deck');
    expect(displayStopName('10043117', 'ACC')).toBe('Mason Farm Rd at Ambulatory Care Center');
    expect(displayStopName('10043124', 'Marsico')).toBe('Ambulatory Care Center (Marsico Hall)');
  });
  it('falls back to the trimmed GMV name', () => {
    expect(displayStopName('12494424', 'Frat Court ')).toBe('Frat Court');
  });
  it('applies names to every network stop', () => {
    const network = makeNetwork();
    network.stops.push({ id: '10044065', name: 'Ehringhaus', lat: 0, lon: 0 });
    const named = withDisplayNames(network);
    expect(named.stops.find((s) => s.id === '10044065')?.name).toBe('Ehringhaus Hall');
    expect(named.stops.find((s) => s.id === 'a')?.name).toBe('Stop A');
  });
});

describe('routeIdFromName', () => {
  it('matches display names case-insensitively', () => {
    expect(routeIdFromName('p2p express')).toBe('P2P_EXPRESS');
    expect(routeIdFromName('Baity Hill')).toBe('BAITY_HILL');
    expect(routeIdFromName('Unknown')).toBeNull();
  });
});

describe('merging a stop GMV lists once per route', () => {
  // Craige Parking Deck: 10043118 (Baity Hill) and 10044086 (P2P Express), 2 m apart.
  const network = makeNetwork();
  network.stops.push({ id: '10043118', name: 'Craige Deck', lat: 35.9, lon: -79.04 }, { id: '10044086', name: 'Craige Deck', lat: 35.90002, lon: -79.04 });
  network.routes[0].patterns[0].stops.push({ stopId: '10044086', sequence: 3, distAlong: 2500 });
  network.routes[1].patterns[0].stops.push({ stopId: '10043118', sequence: 2, distAlong: 2000 });

  it('keeps one stop and points both routes at it', () => {
    const merged = mergeNetworkStops(network);
    expect(merged.stops.filter((s) => s.id === '10043118' || s.id === '10044086').map((s) => s.id)).toEqual(['10043118']);
    expect(merged.routes[0].patterns[0].stops.at(-1)?.stopId).toBe('10043118');
    expect(merged.routes[1].patterns[0].stops.at(-1)?.stopId).toBe('10043118');
  });
  it('combines both routes\' arrivals and remaps vehicle stops', () => {
    const merged = mergeSnapshotStops(makeSnapshot({
      arrivalsByStop: {
        '10044086': [{ routeId: 'P2P_EXPRESS', vehicleId: 'v1', etaSec: 400, scheduled: false }],
        '10043118': [{ routeId: 'BAITY_HILL', vehicleId: 'v2', etaSec: 200, scheduled: false }],
      },
      vehicles: [makeVehicle({ nextStopId: '10044086', upcomingStops: [{ stopId: '10044086', etaSec: 400 }, { stopId: 'c', etaSec: 600 }] })],
    }));
    expect(Object.keys(merged.arrivalsByStop)).toEqual(['10043118']);
    expect(merged.arrivalsByStop['10043118'].map((a) => a.etaSec)).toEqual([200, 400]);
    expect(merged.vehicles[0].nextStopId).toBe('10043118');
    expect(merged.vehicles[0].upcomingStops.map((u) => u.stopId)).toEqual(['10043118', 'c']);
  });
});
