import { Coordinate, Destination, Journey, JourneySegment, Stop } from '../types';
import { getDistanceMeters, getWalkTimeMinutes, findNearestStop } from './geo';
import { STOPS, ROUTES } from '../data/mockTransit';

export const calculateJourney = (
  userLocation: Coordinate, 
  destination: Destination
): Journey => {
  // 1. Find nearest stop to user (Origin Stop)
  const originStop = findNearestStop(userLocation, STOPS);
  
  // 2. Find nearest stop to destination (Dest Stop)
  const destStop = findNearestStop(destination, STOPS);

  if (!originStop || !destStop) {
    throw new Error("Could not find transit stops");
  }

  const segments: JourneySegment[] = [];
  const now = new Date();
  
  // SEGMENT 1: Walk to Origin Stop
  const distToOrigin = getDistanceMeters(userLocation, originStop);
  const timeToOrigin = getWalkTimeMinutes(distToOrigin);
  
  segments.push({
    type: 'walk',
    fromName: 'Current Location',
    toName: originStop.name,
    fromCoords: userLocation,
    toCoords: { lat: originStop.lat, lon: originStop.lon },
    distanceMeters: distToOrigin,
    durationMin: timeToOrigin,
    instruction: `Walk to ${originStop.name}`
  });

  // SEGMENT 2: Bus Ride
  // In a real app, we would query a routing engine (OTP, Valhalla)
  // For mock, we assume P2P Express connects these if they are far apart, otherwise just walk.
  const distBus = getDistanceMeters(originStop, destStop);
  
  // If stops are very close, just walk directly (skip bus)
  if (originStop.id === destStop.id || distBus < 200) {
      // Modify first segment to go straight to dest
      segments[0].toName = destination.name;
      segments[0].toCoords = { lat: destination.lat, lon: destination.lon };
      segments[0].distanceMeters = getDistanceMeters(userLocation, destination);
      segments[0].durationMin = getWalkTimeMinutes(segments[0].distanceMeters);
      segments[0].instruction = `Walk to ${destination.name}`;
  } else {
    // Simulate bus ride
    const busDuration = Math.ceil((distBus / 10) / 60) + 5; // Rough approximation + wait time
    const waitTime = 5; // Mock wait time
    
    segments.push({
      type: 'bus',
      fromName: originStop.name,
      toName: destStop.name,
      fromCoords: { lat: originStop.lat, lon: originStop.lon },
      toCoords: { lat: destStop.lat, lon: destStop.lon },
      distanceMeters: distBus,
      durationMin: busDuration,
      instruction: `Ride P2P Express`,
      routeId: 'p2p-express',
      routeName: 'P2P Express',
      stopsCount: 3,
      waitTimeMin: waitTime
    });

    // SEGMENT 3: Walk from Dest Stop to Final Dest
    const distToFinal = getDistanceMeters(destStop, destination);
    const timeToFinal = getWalkTimeMinutes(distToFinal);

    segments.push({
      type: 'walk',
      fromName: destStop.name,
      toName: destination.name,
      fromCoords: { lat: destStop.lat, lon: destStop.lon },
      toCoords: { lat: destination.lat, lon: destination.lon },
      distanceMeters: distToFinal,
      durationMin: timeToFinal,
      instruction: `Walk to ${destination.name}`
    });
  }

  const totalDuration = segments.reduce((acc, seg) => acc + seg.durationMin + (seg.waitTimeMin || 0), 0);
  const arrivalTime = new Date(now.getTime() + totalDuration * 60000);

  return {
    id: `journey-${Date.now()}`,
    destination,
    totalDurationMin: totalDuration,
    segments,
    startTime: now,
    arrivalTime
  };
};
