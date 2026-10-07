/**
 * Google encoded-polyline decoding (precision 5) and geodesic length.
 * GMV pattern shapes use this encoding.
 */

const EARTH_RADIUS_M = 6371000;

function decodeValue(encoded, start) {
  let result = 0;
  let shift = 0;
  let index = start;
  let byte;
  do {
    byte = encoded.charCodeAt(index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);
  const value = result & 1 ? ~(result >> 1) : result >> 1;
  return { value, next: index };
}

/** Decode to [lng, lat] pairs (GeoJSON order). */
function decodePolyline(encoded) {
  if (typeof encoded !== 'string' || encoded.length === 0) return [];
  const coords = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    const dLat = decodeValue(encoded, index);
    const dLng = decodeValue(encoded, dLat.next);
    index = dLng.next;
    lat += dLat.value;
    lng += dLng.value;
    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}

function haversineMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a[1])) * Math.cos(toRad(b[1]));
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function lineLengthMeters(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversineMeters(coords[i - 1], coords[i]);
  return total;
}

module.exports = { decodePolyline, lineLengthMeters };
