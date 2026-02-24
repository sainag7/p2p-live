/**
 * Small API server for ops features that require server-side only (e.g. Gemini, Mapbox Directions).
 * GEMINI_API_KEY / MAPBOX_TOKEN must be set in environment; never exposed to client.
 */

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || process.env.OPS_API_PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds
const ROUTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const WALK_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

let routeCache = Object.create(null);
let walkCache = Object.create(null);

function roundCoord(c, decimals = 5) {
  return [Number(c[0].toFixed(decimals)), Number(c[1].toFixed(decimals))];
}

function walkCacheKey(from, to) {
  const a = roundCoord(from);
  const b = roundCoord(to);
  return `${a[0]},${a[1]}-${b[0]},${b[1]}`;
}

function loadRouteWaypoints() {
  const p = path.join(__dirname, 'routeWaypoints.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function hashCoords(coords) {
  let h = 0;
  const str = JSON.stringify(coords);
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

async function fetchMapboxRoute(routeId, coords) {
  if (!MAPBOX_TOKEN) throw new Error('MAPBOX_TOKEN is not set');
  const maxWaypoints = 25;
  const coordStr = coords.map((c) => c.join(',')).join(';');
  if (coords.length > maxWaypoints) {
    const chunks = [];
    for (let i = 0; i < coords.length; i += maxWaypoints - 1) {
      const chunk = coords.slice(i, i + maxWaypoints);
      chunks.push(chunk);
    }
    const allCoords = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkCoords = chunks[i].map((c) => c.join(',')).join(';');
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${chunkCoords}?geometries=geojson&overview=full&steps=false&access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Mapbox Directions ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const geom = data.routes?.[0]?.geometry;
      if (!geom || !geom.coordinates) throw new Error('Invalid Mapbox response');
      if (i === 0) allCoords.push(...geom.coordinates);
      else allCoords.push(...geom.coordinates.slice(1));
    }
    return { type: 'LineString', coordinates: allCoords };
  }
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}?geometries=geojson&overview=full&steps=false&access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox Directions ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const geom = data.routes?.[0]?.geometry;
  if (!geom || !geom.coordinates) throw new Error('Invalid Mapbox response');
  return geom;
}

async function handleMapboxRoute(routeId, res) {
  const waypointsData = loadRouteWaypoints();
  const coords = waypointsData[routeId];
  if (!coords || !Array.isArray(coords)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unknown routeId' }));
    return;
  }
  const cacheKey = routeId + ':' + hashCoords(coords);
  const cached = routeCache[cacheKey];
  if (cached && Date.now() - cached.at < ROUTE_CACHE_TTL_MS) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cached.payload));
    return;
  }
  try {
    const geometry = await fetchMapboxRoute(routeId, coords);
    const waypoints = coords.map((c, i) => ({ name: `Stop ${i + 1}`, coordinates: c, order: i }));
    const payload = { routeId, geometry: { type: geometry.type, coordinates: geometry.coordinates }, waypoints };
    routeCache[cacheKey] = { payload, at: Date.now() };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (err) {
    console.error('Mapbox route error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message, routeId }));
  }
}

async function fetchMapboxWalking(fromLngLat, toLngLat) {
  if (!MAPBOX_TOKEN) throw new Error('MAPBOX_TOKEN is not set');
  const coords = `${fromLngLat[0]},${fromLngLat[1]};${toLngLat[0]},${toLngLat[1]}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coords}?geometries=geojson&overview=full&steps=true&access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox Directions ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const route = data.routes && data.routes[0];
  if (!route || !route.geometry || !route.geometry.coordinates) throw new Error('Invalid Mapbox walking response');
  const steps = (route.legs && route.legs[0] && route.legs[0].steps) ? route.legs[0].steps.map((s) => ({
    instruction: (s.maneuver && s.maneuver.instruction) ? s.maneuver.instruction : 'Continue',
    distanceMeters: s.distance != null ? s.distance : 0,
    durationSec: s.duration != null ? s.duration : 0,
  })) : [];
  return {
    durationSec: route.duration != null ? route.duration : 0,
    distanceMeters: route.distance != null ? route.distance : 0,
    geometry: route.geometry,
    steps,
  };
}

async function handleWalkDirections(fromLngLat, toLngLat, res) {
  const key = walkCacheKey(fromLngLat, toLngLat);
  const cached = walkCache[key];
  if (cached && Date.now() - cached.at < WALK_CACHE_TTL_MS) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cached.payload));
    return;
  }
  try {
    const payload = await fetchMapboxWalking(fromLngLat, toLngLat);
    walkCache[key] = { payload, at: Date.now() };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (err) {
    console.error('Mapbox walk directions error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

let summaryCache = null;
let cacheKey = null;

function hashComplaints(complaints) {
  const str = JSON.stringify(complaints.map((c) => ({ id: c.id, category: c.category, notes: c.notes })));
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

async function generateSummaryWithGemini(complaints) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  const prompt = `You are an operations analyst. Summarize the following transit complaints in a concise, actionable way (150-250 words).

Requirements:
- Group by category (e.g. GPS issues, overcrowding, off-route, maintenance).
- Mention counts per category and any top recurring issues.
- Suggest 2-4 next actions (operational and/or technical).
- Use short bullets where appropriate.

Complaints (JSON):
${JSON.stringify(complaints, null, 0)}

Respond with only the summary text (no preamble).`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.3 },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty or invalid Gemini response');
  return text;
}

async function handleComplaintsSummary(req, body, res) {
  const complaints = body?.complaints ?? [];
  const key = hashComplaints(complaints);
  if (summaryCache && cacheKey === key && Date.now() - summaryCache.generatedAt < CACHE_TTL_MS) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(summaryCache));
    return;
  }
  try {
    const summaryMarkdown = await generateSummaryWithGemini(complaints);
    const payload = {
      summaryMarkdown,
      generatedAtISO: new Date().toISOString(),
      model: GEMINI_MODEL,
    };
    summaryCache = { ...payload, generatedAt: Date.now() };
    cacheKey = key;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (err) {
    console.error('Complaints summary error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message, generatedAtISO: null, model: null }));
  }
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;

  const isLocal = origin === 'http://localhost:3000';
  const isProd = origin === 'https://p2pnow.netlify.app';
  const isPreview = typeof origin === 'string' && /^https:\/\/.*--p2pnow\.netlify\.app$/.test(origin);

  if (isLocal || isProd || isPreview) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  if (req.url === "/healthz" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("P2P Live API is running. Try /healthz");
    return;
  }

  if (req.url === '/api/ops/complaints/summary' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        handleComplaintsSummary(req, parsed, res);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }
  const geocodeMatch = req.url && req.method === 'GET' && req.url.startsWith('/api/mapbox/geocode');
  if (geocodeMatch) {
    if (!MAPBOX_TOKEN) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'MAPBOX_TOKEN is not set' }));
      return;
    }
    const u = new URL(req.url, 'http://localhost');
    const q = u.searchParams.get('q') || '';
    const proximity = u.searchParams.get('proximity') || '-79.0478,35.9105';
    const bbox = '-79.08,35.89,-79.03,35.93';
    if (!q.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing q query parameter' }));
      return;
    }
    const encodedQ = encodeURIComponent(q.trim());
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQ}.json?autocomplete=true&limit=5&proximity=${encodeURIComponent(proximity)}&bbox=${bbox}&access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Mapbox Geocoding ' + r.status))))
      .then((data) => {
        const features = Array.isArray(data.features) ? data.features : [];
        const results = features
          .map((f) => ({
            id: f.id,
            place_name: f.place_name,
            coordinates: Array.isArray(f.center) && f.center.length >= 2 ? [f.center[0], f.center[1]] : null,
            type: Array.isArray(f.place_type) && f.place_type.length ? f.place_type[0] : 'unknown',
          }))
          .filter((r) => !!r.coordinates);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results }));
      })
      .catch((err) => {
        console.error('Mapbox geocode error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }
  const routeMatch = req.url && req.method === 'GET' && req.url.startsWith('/api/mapbox/route');
  if (routeMatch) {
    const u = new URL(req.url, 'http://localhost');
    const routeId = u.searchParams.get('routeId');
    if (routeId === 'P2P_EXPRESS' || routeId === 'BAITY_HILL') {
      handleMapboxRoute(routeId, res);
      return;
    }
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'routeId must be P2P_EXPRESS or BAITY_HILL' }));
    return;
  }
  const walkMatch = req.url && req.method === 'GET' && req.url.startsWith('/api/mapbox/directions/walk');
  if (walkMatch) {
    const u = new URL(req.url, 'http://localhost');
    const from = u.searchParams.get('from');
    const to = u.searchParams.get('to');
    if (!from || !to) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing from or to (lng,lat)' }));
      return;
    }
    const fromParts = from.split(',').map((n) => parseFloat(n.trim()));
    const toParts = to.split(',').map((n) => parseFloat(n.trim()));
    if (fromParts.length !== 2 || toParts.length !== 2 || fromParts.some(isNaN) || toParts.some(isNaN)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'from and to must be lng,lat' }));
      return;
    }
    handleWalkDirections([fromParts[0], fromParts[1]], [toParts[0], toParts[1]], res);
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, "0.0.0.0", () => {
  if (!GEMINI_API_KEY) {
    console.warn('Warning: GEMINI_API_KEY not set. /api/ops/complaints/summary will return 500.');
  }
  if (!MAPBOX_TOKEN) {
    console.warn('Warning: MAPBOX_TOKEN not set. /api/mapbox/route will return 500.');
  }
  console.log(`API server listening on port ${PORT}`);
});
