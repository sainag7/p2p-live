/**
 * Converts a Journey into GeoJSON sources for the map: walk segments (dashed), bus segments (solid, road-following), destination point.
 */

import { Coordinate } from '../types';
import type { Journey } from '../types';
import { ROUTE_POLYLINES, type RouteId } from '../data/routePolylines';

function dist2(a: [number, number], b: { lat: number; lon: number }): number {
  const dlat = a[1] - b.lat;
  const dlon = a[0] - b.lon;
  return dlat * dlat + dlon * dlon;
}

/** Find index on line L closest to point p. */
function closestIndex(line: [number, number][], p: Coordinate): number {
  let best = 0;
  let bestD = dist2(line[0], p);
  for (let i = 1; i < line.length; i++) {
    const d = dist2(line[i], p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Slice the route polyline from point A to point B (in direction of travel). Returns LineString coordinates. */
function sliceRouteLine(
  line: [number, number][],
  from: Coordinate,
  to: Coordinate
): [number, number][] {
  const i = closestIndex(line, from);
  const j = closestIndex(line, to);
  if (i <= j) return line.slice(i, j + 1);
  return line.slice(j, i + 1).reverse();
}

interface GeoJSONFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [number, number][] } | { type: 'Point'; coordinates: number[] };
  properties: Record<string, unknown>;
}

export interface JourneyMapSources {
  walkGeoJson: { type: 'FeatureCollection'; features: GeoJSONFeature[] };
  busGeoJson: { type: 'FeatureCollection'; features: GeoJSONFeature[] };
  destinationGeoJson: { type: 'FeatureCollection'; features: GeoJSONFeature[] } | null;
}

const emptyFC = (): JourneyMapSources['walkGeoJson'] => ({ type: 'FeatureCollection', features: [] });

export function journeyToMapSources(journey: Journey | null): JourneyMapSources {
  if (!journey || journey.segments.length === 0) {
    return {
      walkGeoJson: emptyFC(),
      busGeoJson: emptyFC(),
      destinationGeoJson: null,
    };
  }

  const walkFeatures: GeoJSONFeature[] = [];
  const busFeatures: GeoJSONFeature[] = [];

  for (const seg of journey.segments) {
    const coords: [number, number][] = [
      [seg.fromCoords.lon, seg.fromCoords.lat],
      [seg.toCoords.lon, seg.toCoords.lat],
    ];
    if (seg.type === 'walk') {
      walkFeatures.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      });
    } else {
      const routeId = (seg.routeId || 'p2p-express') as RouteId;
      const line = ROUTE_POLYLINES[routeId];
      let busCoords = line
        ? sliceRouteLine(line, seg.fromCoords, seg.toCoords)
        : coords;
      if (busCoords.length < 2) busCoords = coords;
      busFeatures.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: busCoords },
        properties: { routeId: seg.routeId || 'p2p-express' },
      });
    }
  }

  const dest = journey.destination;
  const destinationGeoJson: JourneyMapSources['destinationGeoJson'] = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [dest.lon, dest.lat],
        },
        properties: { name: dest.name },
      },
    ],
  };

  return {
    walkGeoJson: { type: 'FeatureCollection', features: walkFeatures },
    busGeoJson: { type: 'FeatureCollection', features: busFeatures },
    destinationGeoJson,
  };
}
