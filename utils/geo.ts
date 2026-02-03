import { Coordinate, Stop } from '../types';

const WALKING_SPEED_MPS = 1.4; // Average walking speed ~1.4 m/s

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

/**
 * Haversine formula to calculate distance between two points in meters
 */
export const getDistanceMeters = (c1: Coordinate, c2: Coordinate): number => {
  const R = 6371e3; // Earth radius in meters
  const dLat = toRad(c2.lat - c1.lat);
  const dLon = toRad(c2.lon - c1.lon);
  const lat1 = toRad(c1.lat);
  const lat2 = toRad(c2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

export const getWalkTimeMinutes = (distanceMeters: number): number => {
  return Math.ceil(distanceMeters / WALKING_SPEED_MPS / 60);
};

export const findNearestStop = (userLocation: Coordinate, stops: Stop[]): Stop | null => {
  if (!stops.length) return null;
  
  let nearest = stops[0];
  let minDist = getDistanceMeters(userLocation, stops[0]);

  for (let i = 1; i < stops.length; i++) {
    const dist = getDistanceMeters(userLocation, stops[i]);
    if (dist < minDist) {
      minDist = dist;
      nearest = stops[i];
    }
  }

  return nearest;
};
