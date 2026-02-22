/**
 * Curated route polylines (road-following) for bus segments on the map.
 * Coordinates [lng, lat] in stop order; used to slice bus segment geometry between boarding and alighting stops.
 * Stops match p2pStops (student-union, davis-lib, kenan-stadium, franklin-st, morrison | dean-dome, baity-hill-apts, south-campus).
 */

export type RouteId = 'p2p-express' | 'baity-hill';

/** LineString coordinates [lng, lat][] per route, in stop order along the route. */
export const ROUTE_POLYLINES: Record<RouteId, [number, number][]> = {
  'p2p-express': [
    [-79.0478, 35.9105],   // student-union (order 1)
    [-79.0470, 35.9088],   // davis-lib (2)
    [-79.0479, 35.9069],   // kenan-stadium (3)
    [-79.0558, 35.9132],   // franklin-st (4)
    [-79.0465, 35.9045],   // morrison (5)
  ],
  'baity-hill': [
    [-79.0438, 35.8999],   // dean-dome (1)
    [-79.0400, 35.8970],   // baity-hill-apts (2)
    [-79.0450, 35.9035],   // south-campus (3)
  ],
};
