import { describe, it, expect } from 'vitest';
import {
  activePatternKey, getActivePattern, getActiveStops, getPattern, getRoute, getRouteStops, getRoutesServingStop, getStopById,
} from '../../utils/transitSelectors';
import { makeNetwork, makeSnapshot } from '../fixtures/transit';

describe('transitSelectors', () => {
  const network = makeNetwork();

  it('finds routes, patterns and stops by id', () => {
    expect(getRoute(network, 'BAITY_HILL')?.gmvId).toBe(6564);
    expect(getPattern(network, 11)?.name).toBe('Football - P2P Express');
    expect(getPattern(network, 999)).toBeNull();
    expect(getStopById(network, 'e')?.name).toBe('Stop E');
    expect(getRoute(null, 'BAITY_HILL')).toBeNull();
  });

  it('uses the snapshot active pattern, else the network default', () => {
    expect(getActivePattern(network, makeSnapshot({ activePatternIds: { P2P_EXPRESS: 11 } }), 'P2P_EXPRESS')?.id).toBe(11);
    expect(getActivePattern(network, null, 'P2P_EXPRESS')?.id).toBe(10);
    expect(getActivePattern(network, makeSnapshot({ activePatternIds: { P2P_EXPRESS: 404 } }), 'P2P_EXPRESS')?.id).toBe(10);
  });

  it('returns ordered stops of the active pattern', () => {
    expect(getRouteStops(network, null, 'P2P_EXPRESS').map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it.each(['no-service', 'unavailable'] as const)('keeps default paths and stops with a %s snapshot', status => {
    const snapshot = makeSnapshot({ status, vehicles: [], activePatternIds: {}, arrivalsByStop: {} });
    expect(getActivePattern(network, snapshot, 'P2P_EXPRESS')?.id).toBe(10);
    expect(getActivePattern(network, snapshot, 'BAITY_HILL')?.id).toBe(20);
    expect(getActivePattern(network, snapshot, 'P2P_EXPRESS')?.geometry.coordinates.length).toBeGreaterThan(1);
    expect(getActiveStops(network, snapshot).map(s => s.id)).toEqual(['a', 'b', 'c', 'e']);
  });

  it('unions active stops across routes without duplicates', () => {
    expect(getActiveStops(network, null).map((s) => s.id)).toEqual(['a', 'b', 'c', 'e']);
  });

  it('lists routes serving a stop on their active pattern only', () => {
    expect(getRoutesServingStop(network, null, 'c')).toEqual(['P2P_EXPRESS', 'BAITY_HILL']);
    expect(getRoutesServingStop(network, makeSnapshot({ activePatternIds: { P2P_EXPRESS: 11 } }), 'c')).toEqual(['BAITY_HILL']);
  });

  it('builds a stable key from active pattern ids', () => {
    expect(activePatternKey(makeSnapshot({ activePatternIds: { BAITY_HILL: 20, P2P_EXPRESS: 10 } }))).toBe('BAITY_HILL:20|P2P_EXPRESS:10');
    expect(activePatternKey(null)).toBe('');
  });
});
