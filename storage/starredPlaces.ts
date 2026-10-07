import type { Destination } from '../types';

const STORAGE_KEY = 'p2p_starred_places_v1';
const MAX_ITEMS = 12;

/** A place the rider starred: shown first in search and, with times, on Home. */
export type StarredPlace = Destination;

function load(): StarredPlace[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((p): p is StarredPlace => typeof p?.id === 'string' && typeof p.name === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lon))
      : [];
  } catch {
    return [];
  }
}

function save(items: StarredPlace[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // storage full or disabled: stars last for this visit only
  }
}

/** Two entries are the same place if they share an id, or a name within ~50 m (a geocoded copy of a campus place). */
export function samePlace(a: Destination, b: Destination): boolean {
  if (a.id === b.id) return true;
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && Math.abs(a.lat - b.lat) < 0.0005 && Math.abs(a.lon - b.lon) < 0.0005;
}

/** Starred places, oldest first so Home keeps a stable order. */
export function getStarredPlaces(): StarredPlace[] {
  return load();
}

/** Star or unstar a place; returns the new list. */
export function toggleStarredPlace(place: Destination): StarredPlace[] {
  const items = load();
  const next = items.some((p) => samePlace(p, place))
    ? items.filter((p) => !samePlace(p, place))
    : [...items, { id: place.id, name: place.name, lat: place.lat, lon: place.lon, ...(place.address ? { address: place.address } : {}) }];
  save(next);
  return next;
}
