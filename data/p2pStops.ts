/**
 * P2P stops source of truth — aligned with official UNC P2P map.
 * Routes: Point-to-Point Express (P2P_EXPRESS), Baity Hill Shuttle (BAITY_HILL).
 * Use Stop Placement Mode (?devStops=1 in dev) to digitize and export coordinates.
 */

import { Stop } from '../types';

export type P2PRouteId = 'P2P_EXPRESS' | 'BAITY_HILL';

export interface P2PStopInput {
  stopId: string;
  name: string;
  route: P2PRouteId;
  lat: number;
  lon: number;
  order?: number;
}

/** Stops with route assignment. Coordinates to be refined via Stop Placement Mode. */
const P2P_STOPS_DATA: P2PStopInput[] = [
  // Point-to-Point Express (dark/navy loop) — campus / Franklin
  { stopId: 'student-union', name: 'Student Union', route: 'P2P_EXPRESS', lat: 35.9105, lon: -79.0478, order: 1 },
  { stopId: 'davis-lib', name: 'Davis Library', route: 'P2P_EXPRESS', lat: 35.9088, lon: -79.0470, order: 2 },
  { stopId: 'kenan-stadium', name: 'Kenan Stadium', route: 'P2P_EXPRESS', lat: 35.9069, lon: -79.0479, order: 3 },
  { stopId: 'franklin-st', name: 'Franklin St (Target)', route: 'P2P_EXPRESS', lat: 35.9132, lon: -79.0558, order: 4 },
  { stopId: 'morrison', name: 'Morrison Residence Hall', route: 'P2P_EXPRESS', lat: 35.9045, lon: -79.0465, order: 5 },
  // Baity Hill Shuttle (light blue loop)
  { stopId: 'dean-dome', name: 'Dean Smith Center', route: 'BAITY_HILL', lat: 35.8999, lon: -79.0438, order: 1 },
  { stopId: 'baity-hill-apts', name: 'Baity Hill Apts', route: 'BAITY_HILL', lat: 35.8970, lon: -79.0400, order: 2 },
  { stopId: 'south-campus', name: 'South Campus Dorms', route: 'BAITY_HILL', lat: 35.9035, lon: -79.0450, order: 3 },
];

/** All P2P stops with route metadata (for map styling / filtering). */
export const P2P_STOPS: P2PStopInput[] = P2P_STOPS_DATA;

/** Stops as Stop[] for app/journey/geo — same IDs and names, lat/lon from source of truth. */
export const STOPS: Stop[] = P2P_STOPS_DATA.map((s) => ({
  id: s.stopId,
  name: s.name,
  lat: s.lat,
  lon: s.lon,
}));

/** Route IDs for map legend / filtering. */
export const P2P_ROUTE_IDS = ['P2P_EXPRESS', 'BAITY_HILL'] as const;
