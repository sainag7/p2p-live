import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStarredPlaces, samePlace, toggleStarredPlace } from '../../storage/starredPlaces';

const davis = { id: 'davis-library', name: 'Davis Library', lat: 35.9107, lon: -79.0479, address: '208 Raleigh St, Chapel Hill, NC' };

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('starred places', () => {
  it('stars and unstars a place', () => {
    expect(toggleStarredPlace(davis)).toEqual([davis]);
    expect(getStarredPlaces()).toEqual([davis]);
    expect(toggleStarredPlace(davis)).toEqual([]);
    expect(getStarredPlaces()).toEqual([]);
  });
  it('treats a geocoded copy of the same place as already starred', () => {
    toggleStarredPlace(davis);
    const geocoded = { ...davis, id: 'addr-123', lat: davis.lat + 0.0001 };
    expect(samePlace(davis, geocoded)).toBe(true);
    expect(toggleStarredPlace(geocoded)).toEqual([]);
  });
  it('keeps places with the same name but far apart separate', () => {
    expect(samePlace(davis, { ...davis, id: 'other', lat: davis.lat + 0.01 })).toBe(false);
  });
  it('ignores damaged saved data', () => {
    vi.stubGlobal('localStorage', memoryStorage({ p2p_starred_places_v1: JSON.stringify([davis, { id: 'x' }, null]) }));
    expect(getStarredPlaces()).toEqual([davis]);
    vi.stubGlobal('localStorage', memoryStorage({ p2p_starred_places_v1: '{not json' }));
    expect(getStarredPlaces()).toEqual([]);
  });
  it('still returns the new list when storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota'); } });
    expect(toggleStarredPlace(davis)).toEqual([davis]);
  });
});
