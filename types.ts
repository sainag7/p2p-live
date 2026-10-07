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
  /** Exact duration; durationMin is rounded up for display. */
  durationSec?: number;
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
  /** Exact wait at the board stop after walking there. */
  waitSec?: number;
  /** Whether waitTimeMin comes from a live prediction or the timetable. */
  waitSource?: 'live' | 'scheduled';
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

export type ViewState = 'list' | 'map';

// ---------------------------------------------------------------------------
// Live transit (GMV Syncromatics via /api/live/*)
// ---------------------------------------------------------------------------

/** Canonical route ids (GMV routes 6566 and 6564). */
export type RouteId = 'P2P_EXPRESS' | 'BAITY_HILL';

export interface PatternStop {
  stopId: string;
  sequence: number;
  /** Meters along the pattern line from its start. */
  distAlong: number;
}

/** One GMV route variant (e.g. "P2P Express", "Football - P2P Express"). */
export interface RoutePattern {
  id: number;
  name: string;
  geometry: LineStringGeometry;
  lengthMeters: number;
  stops: PatternStop[];
}

export interface NetworkRoute {
  id: RouteId;
  gmvId: number;
  name: string;
  shortName: string;
  color: string | null;
  textColor: string | null;
  defaultPatternId: number | null;
  patterns: RoutePattern[];
}

export interface TransitNetwork {
  routes: NetworkRoute[];
  stops: Stop[];
}

export type LiveStatus = 'live' | 'no-service' | 'degraded' | 'unavailable';
/** Client-side status: adds 'loading' before the first snapshot attempt. */
export type ClientLiveStatus = LiveStatus | 'loading';

export interface LiveUpcomingStop {
  stopId: string;
  etaSec: number;
}

export interface LiveVehicle {
  id: string;
  name: string;
  routeId: RouteId;
  routeName: string;
  patternId: number | null;
  lat: number;
  lon: number;
  heading: number;
  speedMps: number | null;
  /** Meters along the vehicle's pattern line at `lastUpdated`. */
  distAlong: number | null;
  capacity: number | null;
  /** Passenger load, 0–1. */
  load: number | null;
  lastUpdated: string | null;
  /** True when GMV has not updated this vehicle for more than 90 s. */
  stale: boolean;
  nextStopId: string | null;
  nextStopEtaSec: number | null;
  upcomingStops: LiveUpcomingStop[];
}

export interface LiveStopArrival {
  routeId: RouteId;
  vehicleId: string | null;
  etaSec: number;
  /** GMV schedulePrediction: true when this is a timetable estimate, not a live prediction. */
  scheduled: boolean;
}

export interface ServiceMessage {
  id: string;
  title: string;
  body: string;
  global: boolean;
  routeIds: RouteId[];
  stopIds: string[];
  startsAt: string | null;
  endsAt: string | null;
}

export interface LiveSnapshot {
  fetchedAt: string;
  status: LiveStatus;
  activePatternIds: Partial<Record<RouteId, number>>;
  vehicles: LiveVehicle[];
  arrivalsByStop: Record<string, LiveStopArrival[]>;
  messages: ServiceMessage[];
  /** Notices are refreshing without delaying bus data. */
  messagesPending?: boolean;
}

/** An arrival as shown in the UI, from live data or the timetable. */
export interface StopArrival {
  routeId: RouteId;
  routeName: string;
  etaSec: number;
  source: 'live' | 'scheduled';
  vehicleId: string | null;
}
