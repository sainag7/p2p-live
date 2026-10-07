/** Public rider API: GMV transit data plus Mapbox search and walking directions. */

if (process.env.NODE_ENV !== 'production') {
  const dotenv = require('dotenv');
  // Vite already reads .env.local. Load that same local file for the Node API first,
  // then accept .env as a lower-priority legacy fallback.
  dotenv.config({ path: '.env.local', quiet: true });
  dotenv.config({ quiet: true });
}

const http = require('http');
const { gzip } = require('zlib');
const { createGmvClient } = require('./gmv/client.cjs');
const { createGmvService } = require('./gmv/service.cjs');

const PORT = process.env.PORT || 3001;
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;
const GMV_RTPI_API_KEY = process.env.GMV_RTPI_API_KEY;
const defaultGmvService = createGmvService({ client: createGmvClient({ apiKey: GMV_RTPI_API_KEY }) });
const WALK_CACHE_TTL_MS = 15 * 60 * 1000;

/** Compress route geometry and snapshots for phones; keep the existing freshness headers. */
function sendJson(req, res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  const baseHeaders = { 'Content-Type': 'application/json', Vary: 'Origin, Accept-Encoding', ...headers };
  const acceptsGzip = (req.headers['accept-encoding'] || '').split(',').some(value => {
    const [encoding, ...params] = value.trim().split(';');
    return encoding === 'gzip' && !params.some(param => /^\s*q=0(?:\.0*)?\s*$/.test(param));
  });
  if (body.length < 1024 || !acceptsGzip) {
    res.writeHead(status, baseHeaders); res.end(body); return;
  }
  gzip(body, (error, compressed) => {
    if (res.destroyed) return;
    res.writeHead(status, error ? baseHeaders : { ...baseHeaders, 'Content-Encoding': 'gzip' });
    res.end(error ? body : compressed);
  });
}

function roundCoord(coord, decimals = 5) {
  return [Number(coord[0].toFixed(decimals)), Number(coord[1].toFixed(decimals))];
}

function walkCacheKey(from, to) {
  const a = roundCoord(from);
  const b = roundCoord(to);
  return `${a[0]},${a[1]}-${b[0]},${b[1]}`;
}

function createApiServer({ gmvService = defaultGmvService, mapboxToken = MAPBOX_TOKEN } = {}) {
  const walkCache = new Map();
  const walkRequests = new Map();

  async function fetchMapboxWalking(fromLngLat, toLngLat) {
    if (!mapboxToken) throw new Error('MAPBOX_TOKEN is not set');
    const coords = `${fromLngLat[0]},${fromLngLat[1]};${toLngLat[0]},${toLngLat[1]}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coords}?geometries=geojson&overview=full&steps=true&access_token=${encodeURIComponent(mapboxToken)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Mapbox Directions ${response.status}: ${await response.text()}`);
    const data = await response.json();
    const route = data.routes && data.routes[0];
    if (!route || !route.geometry || !route.geometry.coordinates) throw new Error('Invalid Mapbox walking response');
    const steps = route.legs?.[0]?.steps?.map((step) => ({
      instruction: step.maneuver?.instruction || 'Continue',
      distanceMeters: step.distance ?? 0,
      durationSec: step.duration ?? 0,
    })) || [];
    return {
      durationSec: route.duration ?? 0,
      distanceMeters: route.distance ?? 0,
      geometry: route.geometry,
      steps,
    };
  }

  async function handleWalkDirections(fromLngLat, toLngLat, req, res) {
    const key = walkCacheKey(fromLngLat, toLngLat);
    const cached = walkCache.get(key);
    if (cached && Date.now() - cached.at < WALK_CACHE_TTL_MS) {
      sendJson(req, res, 200, cached.payload);
      return;
    }
    try {
      let request = walkRequests.get(key);
      if (!request) {
        request = fetchMapboxWalking(fromLngLat, toLngLat).then(payload => {
          if (walkCache.size >= 500) walkCache.delete(walkCache.keys().next().value);
          walkCache.set(key, { payload, at: Date.now() });
          return payload;
        }).finally(() => walkRequests.delete(key));
        walkRequests.set(key, request);
      }
      sendJson(req, res, 200, await request);
    } catch (err) {
      console.error('Mapbox walk directions error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  return http.createServer((req, res) => {
    const origin = req.headers.origin;
    const isLocal = typeof origin === 'string' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const isProd = origin === 'https://p2pnow.netlify.app';
    const isPreview = typeof origin === 'string' && /^https:\/\/.*--p2pnow\.netlify\.app$/.test(origin);
    if (isLocal || isProd || isPreview) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/healthz' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('P2P Live API is running. Try /healthz');
      return;
    }

    const pathname = (req.url || '').split('?')[0];
    if (pathname === '/api/live/network' && req.method === 'GET') {
      gmvService.getNetwork()
        .then((network) => {
          sendJson(req, res, 200, network, { 'Cache-Control': 'public, max-age=300' });
        })
        .catch((err) => {
          console.error('GMV network error:', err.message);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Transit network unavailable' }));
        });
      return;
    }
    if (pathname === '/api/live/snapshot' && req.method === 'GET') {
      gmvService.getSnapshot()
        .then((snapshot) => {
          sendJson(req, res, 200, snapshot, { 'Cache-Control': 'no-store' });
        })
        .catch((err) => {
          console.error('GMV snapshot error:', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Snapshot failed' }));
        });
      return;
    }

    if (req.url && req.method === 'GET' && req.url.startsWith('/api/mapbox/geocode')) {
      if (!mapboxToken) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'MAPBOX_TOKEN is not set' }));
        return;
      }
      const url = new URL(req.url, 'http://localhost');
      const query = url.searchParams.get('q') || '';
      const proximity = url.searchParams.get('proximity') || '-79.0478,35.9105';
      if (!query.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing q query parameter' }));
        return;
      }
      const encodedQuery = encodeURIComponent(query.trim());
      const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?autocomplete=true&limit=5&proximity=${encodeURIComponent(proximity)}&bbox=-79.08,35.89,-79.03,35.93&access_token=${encodeURIComponent(mapboxToken)}`;
      fetch(mapboxUrl, { signal: AbortSignal.timeout(10000) })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`Mapbox Geocoding ${response.status}`))))
        .then((data) => {
          const results = (Array.isArray(data.features) ? data.features : [])
            .map((feature) => ({
              id: feature.id,
              place_name: feature.place_name,
              coordinates: Array.isArray(feature.center) && feature.center.length >= 2 ? [feature.center[0], feature.center[1]] : null,
              type: Array.isArray(feature.place_type) && feature.place_type.length ? feature.place_type[0] : 'unknown',
            }))
            .filter((result) => result.coordinates);
          sendJson(req, res, 200, { results });
        })
        .catch((err) => {
          console.error('Mapbox geocode error:', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });
      return;
    }

    if (req.url && req.method === 'GET' && req.url.startsWith('/api/mapbox/directions/walk')) {
      const url = new URL(req.url, 'http://localhost');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (!from || !to) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing from or to (lng,lat)' }));
        return;
      }
      const fromParts = from.split(',').map((n) => parseFloat(n.trim()));
      const toParts = to.split(',').map((n) => parseFloat(n.trim()));
      if (fromParts.length !== 2 || toParts.length !== 2 || fromParts.some(Number.isNaN) || toParts.some(Number.isNaN)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'from and to must be lng,lat' }));
        return;
      }
      handleWalkDirections(fromParts, toParts, req, res);
      return;
    }

    res.writeHead(404);
    res.end();
  });
}

if (require.main === module) {
  createApiServer().listen(PORT, '0.0.0.0', () => {
    if (!MAPBOX_TOKEN) console.warn('Warning: MAPBOX_TOKEN not set. Geocoding and walking directions will return 500.');
    if (!GMV_RTPI_API_KEY) console.warn('Warning: GMV_RTPI_API_KEY not set. /api/live/* will report status "unavailable".');
    console.log(`API server listening on port ${PORT}`);
  });
}

module.exports = { createApiServer };
