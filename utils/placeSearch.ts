/** Campus place lookup for the search sheet: curated places first, geocoded addresses after. */
import type { Destination } from '../types';
import { TOP_LOCATIONS, topLocationToDestination } from '../data/topLocations';

export const CAMPUS_PLACES: Destination[] = TOP_LOCATIONS.map(topLocationToDestination);

/** Curated places whose name, address or a nickname contains the query ("canes", "rams"). */
export function searchCampusPlaces(query: string): Destination[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return TOP_LOCATIONS.filter((loc) => [loc.name, loc.address, ...loc.aliases].some((f) => f.toLowerCase().includes(q)))
    // Name matches read as the best answers; alias-only matches follow.
    .sort((a, b) => Number(!a.name.toLowerCase().includes(q)) - Number(!b.name.toLowerCase().includes(q)))
    .map(topLocationToDestination);
}

/** Splits `text` around the first case-insensitive match of `query`, for highlighting. */
export function highlightMatch(text: string, query: string): { before: string; match: string; after: string } {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return { before: text, match: '', after: '' };
  return { before: text.slice(0, at), match: text.slice(at, at + q.length), after: text.slice(at + q.length) };
}
