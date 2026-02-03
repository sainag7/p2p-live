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

export interface UpcomingStop {
  stopId: string;
  etaMin: number;
}

export interface Vehicle {
  id: string;
  routeId: string;
  routeName: string;
  lat: number;
  lon: number;
  heading: number;
  nextStopId: string;
  nextStopEtaMin: number;
  upcomingStops: UpcomingStop[];
}

export interface Destination {
  id: string;
  name: string;
  lat: number;
  lon: number;
  address?: string;
}

export type SegmentType = 'walk' | 'bus';

export interface JourneySegment {
  type: SegmentType;
  fromName: string;
  toName: string;
  fromCoords: Coordinate;
  toCoords: Coordinate;
  durationMin: number;
  distanceMeters: number;
  instruction: string;
  // Bus specific
  routeId?: string;
  routeName?: string;
  stopsCount?: number;
  waitTimeMin?: number;
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
