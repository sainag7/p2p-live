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
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;
const SYNCROMATICS_API_KEY = process.env.SYNCROMATICS_API_KEY;
const SYNCROMATICS_BASE = 'https://api.syncromatics.com';
const CACHE_TTL_MS = 60 * 1000; // 60 seconds
const ROUTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const WALK_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SYNCRO_LONG_TTL_MS = 60 * 60 * 1000; // 60 min for stops/routes

let routeCache = Object.create(null);
let walkCache = Object.create(null);
let syncroCache = Object.create(null);

// Lightweight in-process diagnostics counters (reset on server restart).
let failedLlmCalls = 0;
let directionsFailures = 0;
let routeDirectionsFailures = 0;

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
    let totalDistance = 0;
    let totalDuration = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunkCoords = chunks[i].map((c) => c.join(',')).join(';');
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${chunkCoords}?geometries=geojson&overview=full&steps=false&access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Mapbox Directions ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const route = data.routes?.[0];
      const geom = route?.geometry;
      if (!geom || !geom.coordinates) throw new Error('Invalid Mapbox response');
      if (i === 0) allCoords.push(...geom.coordinates);
      else allCoords.push(...geom.coordinates.slice(1));
      totalDistance += route?.distance != null ? route.distance : 0;
      totalDuration += route?.duration != null ? route.duration : 0;
    }
    return {
      geometry: { type: 'LineString', coordinates: allCoords },
      distanceMeters: totalDistance,
      durationSec: totalDuration,
    };
  }
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}?geometries=geojson&overview=full&steps=false&access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox Directions ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const route = data.routes?.[0];
  const geom = route?.geometry;
  if (!geom || !geom.coordinates) throw new Error('Invalid Mapbox response');
  return {
    geometry: geom,
    distanceMeters: route?.distance != null ? route.distance : 0,
    durationSec: route?.duration != null ? route.duration : 0,
  };
}

function isValidCoordList(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return false;
  for (const c of coords) {
    if (!Array.isArray(c) || c.length !== 2) return false;
    if (typeof c[0] !== 'number' || typeof c[1] !== 'number') return false;
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) return false;
  }
  return true;
}

async function handleMapboxRouteWithCoords(routeId, coords, res) {
  const cacheKey = routeId + ':' + hashCoords(coords);
  const cached = routeCache[cacheKey];
  if (cached && Date.now() - cached.at < ROUTE_CACHE_TTL_MS) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cached.payload));
    return;
  }
  try {
    const { geometry, distanceMeters, durationSec } = await fetchMapboxRoute(routeId, coords);
    const waypoints = coords.map((c, i) => ({ name: `Stop ${i + 1}`, coordinates: c, order: i }));
    const payload = {
      routeId,
      geometry: { type: geometry.type, coordinates: geometry.coordinates },
      waypoints,
      distanceMeters,
      durationSec,
    };
    routeCache[cacheKey] = { payload, at: Date.now() };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (err) {
    console.error('Mapbox route error:', err.message);
    routeDirectionsFailures += 1;
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message, routeId }));
  }
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
    const { geometry, distanceMeters, durationSec } = await fetchMapboxRoute(routeId, coords);
    const waypoints = coords.map((c, i) => ({ name: `Stop ${i + 1}`, coordinates: c, order: i }));
    const payload = {
      routeId,
      geometry: { type: geometry.type, coordinates: geometry.coordinates },
      waypoints,
      distanceMeters,
      durationSec,
    };
    routeCache[cacheKey] = { payload, at: Date.now() };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (err) {
    console.error('Mapbox route error:', err.message);
    routeDirectionsFailures += 1;
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
    directionsFailures += 1;
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function getMockArrivals(stopId) {
  const routeNames = ['P2P Express', 'Baity Hill'];
  const hash = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    return Math.abs(h);
  };
  const seed = hash(stopId);
  const count = 3 + (seed % 3);
  const out = [];
  for (let i = 0; i < count; i++) {
    const routeName = routeNames[(seed + i) % routeNames.length];
    const etaMin = 2 + (seed % 5) + i * (4 + (seed % 4));
    out.push({ routeName, etaMin });
  }
  out.sort((a, b) => a.etaMin - b.etaMin);
  return out;
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
  // Import Gemini SDK dynamically so this file can stay CommonJS.
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = `You are an operations analyst for a campus late-night bus service.

Summarize the following transit complaints into:
- Key recurring issues (grouped by category such as GPS issues, overcrowding, off-route, maintenance)
- The single most urgent problem for tonight
- 2–4 concrete operational focus areas for the next shift (very specific actions)

Constraints:
- Use short sections with clear labels, but do NOT use markdown headings or bold (no **, ##, etc.).
- Use simple bullet lines starting with \"- \" when listing items.
- Keep the summary between 150 and 250 words.

Complaints (JSON array):
${JSON.stringify(complaints, null, 0)}

Respond with plain text only.`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  if (!text || !text.trim()) throw new Error('Empty or invalid Gemini response');
  return text.trim();
}

async function generateOptimizationSuggestionsWithGemini(metrics) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = `You are a transit optimization expert helping tune a campus late-night shuttle system.

Based on the following campus transit performance metrics, provide actionable optimization suggestions.
When possible, quantify the estimated improvement percentage (impactPercent) using the metrics provided.

Focus areas:
- average wait time
- walk distance / access to stops
- congestion at peak stops
- operational efficiency and reliability

Return ONLY a valid JSON array (no backticks, no markdown, no extra text) with the exact shape:
[
  {
    "title": "Short, action-oriented recommendation",
    "impactPercent": 11,
    "category": "Efficiency | Walk Time | Congestion | Reliability",
    "detail": "1–3 sentences explaining what to change and why. Mention which metric(s) it improves."
  }
]

Rules:
- Provide 4–8 suggestions.
- impactPercent should be a number between 1 and 25.
- category must be exactly one of: Efficiency, Walk Time, Congestion, Reliability.

Metrics JSON:
${JSON.stringify(metrics, null, 0)}
`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  if (!text || !text.trim()) throw new Error('Empty or invalid Gemini response');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('Gemini optimization response was not valid JSON');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Gemini optimization response was empty');
  }
  return parsed;
}

function buildFallbackComplaintsSummary(complaints) {
  if (!complaints || complaints.length === 0) {
    return 'There are currently no active complaints in the system. Continue normal operations and monitor for any new reports from drivers or riders.';
  }
  const byCategory = {};
  let newestTs = 0;
  let newest = null;
  for (const c of complaints) {
    const cat = c.category || 'Other';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    const ts = Date.parse(c.timestamp || '');
    if (!Number.isNaN(ts) && ts > newestTs) {
      newestTs = ts;
      newest = c;
    }
  }
  const total = complaints.length;
  const parts = [];
  parts.push(`There are ${total} active complaints in the last shift.`);
  const cats = Object.keys(byCategory)
    .sort((a, b) => byCategory[b] - byCategory[a])
    .map((cat) => `- ${cat}: ${byCategory[cat]} issue(s)`);
  if (cats.length) {
    parts.push('');
    parts.push('Key categories:');
    parts.push(...cats);
  }
  if (newest) {
    parts.push('');
    parts.push(`Most recent issue appears on ${new Date(newest.timestamp).toLocaleString()} on route ${newest.route} (bus ${newest.busId}): ${newest.category} — ${newest.title}.`);
  }
  parts.push('');
  parts.push('Operational focus for tonight:');
  parts.push('- Monitor buses with recent GPS or tracking issues and verify backup displays before departure.');
  parts.push('- Watch for overcrowding at Student Union and key late-night stops; consider short-term reinforcements if patterns persist.');
  parts.push('- Ensure maintenance follows up on any safety-related items (door sensors, braking, lighting) before the next high-demand window.');
  return parts.join('\n');
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
    failedLlmCalls += 1;
    // Fall back to a simple server-generated summary so UI still shows something.
    const fallback = buildFallbackComplaintsSummary(complaints);
    const payload = {
      summaryMarkdown: fallback,
      generatedAtISO: new Date().toISOString(),
      model: 'fallback',
    };
    summaryCache = { ...payload, generatedAt: Date.now() };
    cacheKey = key;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  }
}

function buildFallbackOptimizationSuggestions(metrics) {
  const suggestions = [];
  const avgWait = metrics?.optimization?.avgWaitTimeMin ?? 6;
  const avgWalk = metrics?.optimization?.avgWalkTimeMin ?? 5;
  const expressEff = metrics?.optimization?.routeEfficiencyScore?.['P2P Express'] ?? 80;
  const baityEff = metrics?.optimization?.routeEfficiencyScore?.['Baity Hill'] ?? 78;
  const mostCongested = metrics?.optimization?.mostCongestedStop || 'Student Union';
  const mostUnderutilized = metrics?.optimization?.mostUnderutilizedStop || 'Baity Hill Community';

  if (avgWait > 5) {
    suggestions.push({
      title: 'Re-balance buses during peak union departures',
      impactPercent: 10,
      category: 'Efficiency',
      detail:
        'Shift one Baity Hill run into the highest-demand P2P Express window to cut average wait time at the Student Union by roughly 8–12%.',
    });
  }
  if (avgWalk > 4) {
    suggestions.push({
      title: 'Add a micro-stop near central campus housing',
      impactPercent: 9,
      category: 'Walk Time',
      detail:
        'Introduce a small, signed boarding location between Rams Head and the Union to shorten walk distance for south-campus riders by about one block.',
    });
  }
  suggestions.push({
    title: 'Tighten Baity Hill schedule around late-night clinic discharge',
    impactPercent: 7,
    category: 'Congestion',
    detail:
      `Align one Baity Hill loop departure with the top-of-hour clinic release to reduce standing loads at ${mostCongested} and smooth boardings.`,
  });
  if (expressEff > baityEff) {
    suggestions.push({
      title: 'Trim low-yield Baity Hill loop beyond underutilized stop',
      impactPercent: 5,
      category: 'Efficiency',
      detail:
        `Evaluate whether the segment beyond ${mostUnderutilized} can be shortened or served every other loop to save 2–4 minutes per Baity Hill cycle.`,
    });
  }
  return suggestions;
}

async function handleAdminOptimizationSummary(req, body, res) {
  const metrics = body?.metrics ?? body ?? {};
  try {
    const suggestions = await generateOptimizationSuggestionsWithGemini(metrics);
    const payload = {
      suggestions,
      generatedAtISO: new Date().toISOString(),
      model: GEMINI_MODEL,
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (err) {
    console.error('Admin optimization summary error:', err.message);
    failedLlmCalls += 1;
    const fallbackSuggestions = buildFallbackOptimizationSuggestions(metrics);
    const payload = {
      suggestions: fallbackSuggestions,
      generatedAtISO: new Date().toISOString(),
      model: 'fallback',
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  }
}

function shouldCacheSyncroPath(path) {
  if (path === '/portal/stops' || path === '/portal/routes') return true;
  return /^\/portal\/routes\/[^/]+\/stops$/.test(path);
}

async function handleSyncromaticsProxy(req, res) {
  if (!SYNCROMATICS_API_KEY) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'SYNCROMATICS_API_KEY is not set' }));
    return;
  }
  const u = new URL(req.url, 'http://localhost');
  const upstreamPath = u.pathname.replace(/^\/api\/syncromatics/, '');
  if (!upstreamPath.startsWith('/portal/')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Only /portal/* paths are proxied' }));
    return;
  }
  const upstreamUrl = `${SYNCROMATICS_BASE}${upstreamPath}${u.search}`;
  const cacheable = shouldCacheSyncroPath(upstreamPath) && !u.search;
  if (cacheable) {
    const cached = syncroCache[upstreamPath];
    if (cached && Date.now() - cached.at < SYNCRO_LONG_TTL_MS) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(cached.body);
      return;
    }
  }
  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        'Api-Key': SYNCROMATICS_API_KEY,
        Accept: 'application/json',
      },
    });
    const body = await upstream.text();
    if (upstream.ok && cacheable) {
      syncroCache[upstreamPath] = { body, at: Date.now() };
    }
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(body);
  } catch (err) {
    console.error('Syncromatics proxy error:', err.message, 'path:', upstreamPath);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
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

  if (req.url === '/api/admin/diagnostics' && req.method === 'GET') {
    const mem = process.memoryUsage();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        env: {
          nodeEnv: process.env.NODE_ENV || 'development',
          mapboxTokenConfigured: !!MAPBOX_TOKEN,
          geminiKeyConfigured: !!GEMINI_API_KEY,
          geminiModel: GEMINI_MODEL,
        },
        cache: {
          routeCacheEntries: Object.keys(routeCache || {}).length,
          walkCacheEntries: Object.keys(walkCache || {}).length,
        },
        errors: {
          failedLlmCalls,
          directionsFailures,
          routeDirectionsFailures,
        },
        memory: {
          rssMb: Math.round(mem.rss / 1024 / 1024),
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        },
        process: {
          pid: process.pid,
          uptimeSec: Math.round(process.uptime()),
          node: process.version,
        },
      })
    );
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
  if (req.url && req.method === 'POST' && req.url.startsWith('/api/mapbox/route')) {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let parsed;
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }
      const routeId = parsed && parsed.routeId;
      if (routeId !== 'P2P_EXPRESS' && routeId !== 'BAITY_HILL') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'routeId must be P2P_EXPRESS or BAITY_HILL' }));
        return;
      }
      const coords = parsed.coords;
      if (!coords || (Array.isArray(coords) && coords.length === 0)) {
        // Fall back to mock waypoints when client didn't provide any.
        handleMapboxRoute(routeId, res);
        return;
      }
      if (!isValidCoordList(coords)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'coords must be an array of [lng,lat] pairs (length >= 2)' }));
        return;
      }
      handleMapboxRouteWithCoords(routeId, coords, res);
    });
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
  const arrivalsMatch = req.url && req.method === 'GET' && req.url.startsWith('/api/arrivals');
  if (arrivalsMatch) {
    const u = new URL(req.url, 'http://localhost');
    const stopId = u.searchParams.get('stopId');
    if (!stopId || !stopId.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing stopId' }));
      return;
    }
    const arrivals = getMockArrivals(stopId.trim());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ arrivals }));
    return;
  }
  const syncroMatch = req.url && req.method === 'GET' && req.url.startsWith('/api/syncromatics/');
  if (syncroMatch) {
    handleSyncromaticsProxy(req, res);
    return;
  }
  if (req.url === '/api/admin-optimization-summary' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        handleAdminOptimizationSummary(req, parsed, res);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
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
  if (!SYNCROMATICS_API_KEY) {
    console.warn('Warning: SYNCROMATICS_API_KEY not set. /api/syncromatics/* will return 503.');
  }
  console.log(`API server listening on port ${PORT}`);
});
