export interface Coordinate {
  lat: number;
  lon: number;
}

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface Route {
  id: string;
  name: string;
  color: string;
}

export interface Vehicle {
  id: string;
  name?: string;
  routeId: string;
  routeName: string;
  lat: number;
  lon: number;
  heading: number;
  speed?: number;
  passengerLoad?: number;
  capacity?: number;
}

export interface Arrival {
  stopId: string;
  routeId: string;
  routeName: string;
  vehicleId: string;
  predictedArrivalTime: string;
  minutesUntilArrival: number;
}

export interface Destination {
  id: string;
  name: string;
  lat: number;
  lon: number;
  address?: string;
}

export type SegmentType = 'walk' | 'bus';

/** One step from Mapbox walking directions (maneuver). */
export interface WalkingStep {
  instruction: string;
  distanceMeters: number;
  durationSec: number;
}

/** GeoJSON LineString for segment geometry on map. */
export interface LineStringGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface JourneySegment {
  type: SegmentType;
  fromName: string;
  toName: string;
  fromCoords: Coordinate;
  toCoords: Coordinate;
  durationMin: number;
  distanceMeters: number;
  instruction: string;
  // Walk: Mapbox geometry + steps
  geometry?: LineStringGeometry;
  steps?: WalkingStep[];
  // Bus: sliced route geometry + ordered stops board → alight
  routeId?: string;
  routeName?: string;
  stopsCount?: number;
  waitTimeMin?: number;
  busSegmentGeometry?: LineStringGeometry;
  /** Stop ids in order from board to alight (including board and alight). */
  busOrderedStopIds?: string[];
}

export interface Journey {
  id: string;
  destination: Destination;
  totalDurationMin: number;
  segments: JourneySegment[];
  startTime: Date;
  arrivalTime: Date;
}

export type ViewState = 'list' | 'map' | 'plan';
