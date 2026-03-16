/**
 * UNC Chapel Hill campus landmarks for enriching walking directions.
 * Used by server to add "near [Landmark]" to steps and by client for arrival text.
 */

export interface UncLandmark {
  name: string;
  lat: number;
  lon: number;
}

/** Recognizable campus buildings and places (approximate coordinates). */
export const UNC_LANDMARKS: UncLandmark[] = [
  { name: 'Hinton James Residence Hall', lat: 35.90337, lon: -79.04388 },
  { name: 'Horton Residence Hall', lat: 35.90337, lon: -79.04388 },
  { name: 'Student Union', lat: 35.90975, lon: -79.04784 },
  { name: 'Davis Library', lat: 35.9112, lon: -79.0482 },
  { name: 'Rams Head Gym', lat: 35.9096, lon: -79.0475 },
  { name: 'Fetzer Gym', lat: 35.90967, lon: -79.0475 },
  { name: 'Kenan Stadium', lat: 35.90815, lon: -79.04699 },
  { name: 'Dean Smith Center', lat: 35.9075, lon: -79.0472 },
  { name: 'Granville Towers', lat: 35.91166, lon: -79.05625 },
  { name: 'Carolina Coffee Shop', lat: 35.91367, lon: -79.05414 },
  { name: 'Ackland Art Museum', lat: 35.9142, lon: -79.0522 },
  { name: 'Lenoir Dining Hall', lat: 35.9105, lon: -79.0485 },
  { name: 'Ehringhaus Hall', lat: 35.90412, lon: -79.04418 },
  { name: 'Bell Tower', lat: 35.909, lon: -79.04906 },
  { name: 'Carmichael Arena', lat: 35.90831, lon: -79.04698 },
  { name: 'Connor Hall', lat: 35.91104, lon: -79.0467 },
  { name: 'Craige Parking Deck', lat: 35.90347, lon: -79.04663 },
  { name: 'Manning Lot', lat: 35.90058, lon: -79.04064 },
  { name: 'Williamson Lot', lat: 35.90042, lon: -79.04316 },
  { name: 'Varsity Theatre', lat: 35.91359, lon: -79.05493 },
  { name: 'Health Sciences Library', lat: 35.90551, lon: -79.05328 },
  { name: 'Sitterson Hall', lat: 35.90929, lon: -79.05322 },
  { name: 'FedEx Global Education Center', lat: 35.90828, lon: -79.05425 },
];

const FEET_PER_METER = 3.28084;

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find the nearest landmark to a point within maxDistanceMeters.
 * Returns the landmark name or null.
 */
export function getNearestLandmark(
  lat: number,
  lon: number,
  maxDistanceMeters: number = 120
): UncLandmark | null {
  let nearest: UncLandmark | null = null;
  let minDist = maxDistanceMeters;
  for (const lm of UNC_LANDMARKS) {
    const d = haversineMeters(lat, lon, lm.lat, lm.lon);
    if (d < minDist) {
      minDist = d;
      nearest = lm;
    }
  }
  return nearest;
}

/** Format distance for step display: feet for short, miles for longer. */
export function formatStepDistance(meters: number): string {
  if (meters < 0.25 * 1609.344) {
    const feet = Math.round((meters * FEET_PER_METER) / 10) * 10;
    return `${feet} ft`;
  }
  const miles = meters / 1609.344;
  return `${miles.toFixed(1)} mi`;
}
