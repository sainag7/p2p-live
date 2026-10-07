/**
 * Pure mappers from GMV Syncromatics payloads to the shapes served by /api/live/*.
 */

const { decodePolyline, lineLengthMeters } = require('./polyline.cjs');
const { SPEED_TO_MPS, STALE_VEHICLE_SEC } = require('./config.cjs');

function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function isoOrNull(v) {
  if (!v || typeof v !== 'string') return null;

  // Extract and validate date components (YYYY-MM-DD)
  const dateMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) return null;

  const [, yearStr, monthStr, dayStr] = dateMatch;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  // Validate month
  if (month < 1 || month > 12) return null;

  // Validate day
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) {
    daysInMonth[1] = 29;
  }
  if (day < 1 || day > daysInMonth[month - 1]) return null;

  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** GMV documents schedulePrediction as both "false" and false. */
function toBool(v) {
  return v === true || v === 'true';
}

function normalizeStop(raw) {
  return { id: String(raw.id), name: String(raw.name || '').trim(), lat: raw.lat, lon: raw.lon };
}

function normalizePattern(rawPattern, rawPatternStops) {
  const coordinates = decodePolyline(rawPattern.shape);
  const sorted = (rawPatternStops || [])
    .filter((e) => e && e.stop && e.stop.id != null)
    .slice()
    .sort((a, b) => (a.stopSequence ?? 0) - (b.stopSequence ?? 0));
  const stops = [];
  for (const entry of sorted) {
    const stopId = String(entry.stop.id);
    if (stops.length && stops[stops.length - 1].stopId === stopId) continue;
    stops.push({ stopId, sequence: entry.stopSequence ?? stops.length, distAlong: numOrNull(entry.shapeDistanceTraveled) ?? 0 });
  }
  return {
    id: rawPattern.id,
    name: String(rawPattern.name || '').trim(),
    geometry: { type: 'LineString', coordinates },
    lengthMeters: Math.round(lineLengthMeters(coordinates)),
    stops,
  };
}

function normalizeVehicle(raw, route, nowMs) {
  const lastUpdated = isoOrNull(raw.lastUpdated);
  const speed = numOrNull(raw.speed);
  const load = numOrNull(raw.passengerLoad);
  return {
    id: String(raw.id),
    name: raw.name ? String(raw.name) : `Bus ${raw.id}`,
    routeId: route.id,
    routeName: route.name,
    patternId: numOrNull(raw.pattern_id ?? raw.patternId),
    lat: raw.lat,
    lon: raw.lon,
    heading: numOrNull(raw.headingDegrees) ?? 0,
    speedMps: speed == null ? null : speed * SPEED_TO_MPS,
    distAlong: numOrNull(raw.shapeDistanceTraveled),
    capacity: numOrNull(raw.capacity),
    load: load == null ? null : Math.min(1, Math.max(0, load)),
    lastUpdated,
    stale: lastUpdated ? nowMs - Date.parse(lastUpdated) > STALE_VEHICLE_SEC * 1000 : false,
    nextStopId: null,
    nextStopEtaSec: null,
    upcomingStops: [],
  };
}

function buildArrivalIndexes(groups) {
  const byVehicle = {};
  const byStop = {};
  for (const { routeId, arrivals } of groups) {
    for (const a of arrivals || []) {
      if (!a || !a.stop || a.stop.id == null || typeof a.secondsToArrival !== 'number') continue;
      const stopId = String(a.stop.id);
      const vehicleId = a.vehicle && a.vehicle.id != null ? String(a.vehicle.id) : null;
      const etaSec = Math.max(0, Math.round(a.secondsToArrival));
      (byStop[stopId] ||= []).push({ routeId, vehicleId, etaSec, scheduled: toBool(a.schedulePrediction) });
      if (vehicleId) (byVehicle[vehicleId] ||= []).push({ stopId, etaSec });
    }
  }
  for (const list of Object.values(byStop)) list.sort((x, y) => x.etaSec - y.etaSec);
  for (const list of Object.values(byVehicle)) list.sort((x, y) => x.etaSec - y.etaSec);
  return { byVehicle, byStop };
}

function attachUpcomingStops(vehicle, byVehicle) {
  const upcomingStops = byVehicle[vehicle.id] || [];
  return {
    ...vehicle,
    upcomingStops,
    nextStopId: upcomingStops.length ? upcomingStops[0].stopId : null,
    nextStopEtaSec: upcomingStops.length ? upcomingStops[0].etaSec : null,
  };
}

function normalizeMessage(raw, routes) {
  const assignments = raw.assignments || {};
  return {
    id: String(raw.id),
    title: String(raw.name || '').trim(),
    body: String(raw.text || '').trim(),
    global: !!assignments.global,
    routeIds: (assignments.routes || []).map((r) => routes[r.id] && routes[r.id].id).filter(Boolean),
    stopIds: (assignments.stops || []).map((s) => String(s.id)),
    startsAt: isoOrNull(raw.start),
    endsAt: isoOrNull(raw.end),
  };
}

function isMessageActive(message, nowMs) {
  const start = message.startsAt ? Date.parse(message.startsAt) : -Infinity;
  const end = message.endsAt ? Date.parse(message.endsAt) : Infinity;
  return start <= nowMs && nowMs <= end;
}

module.exports = {
  normalizeStop,
  normalizePattern,
  normalizeVehicle,
  buildArrivalIndexes,
  attachUpcomingStops,
  normalizeMessage,
  isMessageActive,
};
