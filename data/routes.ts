import type { RouteId } from '../types';

export const ROUTE_IDS: readonly RouteId[] = ['P2P_EXPRESS', 'BAITY_HILL'];

export const ROUTE_NAMES: Record<RouteId, string> = {
  P2P_EXPRESS: 'P2P Express',
  BAITY_HILL: 'Baity Hill',
};

/** App brand colors (used instead of GMV's portal colors). */
export const ROUTE_COLORS: Record<RouteId, string> = {
  P2P_EXPRESS: '#418FC5',
  BAITY_HILL: '#C33934',
};

export function routeIdFromName(name: string): RouteId | null {
  const needle = name.trim().toLowerCase();
  return ROUTE_IDS.find((id) => ROUTE_NAMES[id].toLowerCase() === needle) ?? null;
}
