/** Local production-build benchmark server. All transit/location/walking data is simulated. */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import ts from 'typescript';

const root = path.resolve(process.argv[2] || 'dist');
const port = Number(process.argv[3] || 4173);
const fixtureSource = await readFile(new URL('../tests/fixtures/transit.ts', import.meta.url), 'utf8');
const fixtureCode = ts.transpileModule(fixtureSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { makeNetwork, makeSnapshot, makeVehicle } = await import(`data:text/javascript;base64,${Buffer.from(fixtureCode).toString('base64')}`);
const network = makeNetwork();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const instrumentation = await readFile(new URL('./performance-observer.js', import.meta.url), 'utf8');
const e2eInstrumentation = await readFile(new URL('./e2e-observer.js', import.meta.url), 'utf8');
let failedMapOnce = false;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    // Optional offline-chunk check in a fresh browser tab: /?failMapOnce.
    if (!failedMapOnce && /\/assets\/MapboxMap-.*\.js$/.test(url.pathname)
      && new URL(req.headers.referer || 'http://localhost').searchParams.has('failMapOnce')) {
      failedMapOnce = true; res.writeHead(503); res.end(); return;
    }
    let body, type;
    if (url.pathname.startsWith('/api/')) {
      const slowBus = new URL(req.headers.referer || 'http://localhost').searchParams.has('slowBus');
      const directWalk = url.searchParams.get('from') === '-79.0478,35.9105' && url.searchParams.get('to') === '-79.046,35.912';
      await delay(slowBus && url.pathname === '/api/mapbox/directions/walk' && !directWalk ? 750 : 150);
      type = 'application/json';
      if (url.pathname === '/api/live/network') body = JSON.stringify(network);
      else if (url.pathname === '/api/live/snapshot') body = JSON.stringify(makeSnapshot({
        fetchedAt: new Date().toISOString(),
        vehicles: [makeVehicle({ lastUpdated: new Date().toISOString() })],
      }));
      else if (url.pathname === '/api/mapbox/geocode') body = JSON.stringify({ results: url.searchParams.get('q') === 'market' ? [
        { id: 'fixture-market', place_name: 'Example Market, Chapel Hill, NC', coordinates: [-79.046, 35.912] },
      ] : [] });
      else if (url.pathname === '/api/mapbox/directions/walk') {
        const from = url.searchParams.get('from').split(',').map(Number);
        const to = url.searchParams.get('to').split(',').map(Number);
        // Illustrative straight-line walk for timing only, never used by the production app.
        const meters = Math.hypot((from[0] - to[0]) * 90000, (from[1] - to[1]) * 111000);
        body = JSON.stringify({ durationSec: meters / 1.4, distanceMeters: meters,
          geometry: { type: 'LineString', coordinates: [from, to] }, steps: [] });
      } else { res.writeHead(404); res.end(); return; }
    } else if (url.pathname === '/benchmark-observer.js') {
      body = instrumentation; type = 'text/javascript';
    } else if (url.pathname === '/e2e-observer.js') {
      body = e2eInstrumentation; type = 'text/javascript';
    } else {
      const file = path.resolve(root, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
      if (!file.startsWith(`${root}${path.sep}`)) { res.writeHead(403); res.end(); return; }
      body = await readFile(file);
      type = types[path.extname(file)] || 'application/octet-stream';
      if (type === 'text/html') body = body.toString().replace('<head>', `<head><script src="/benchmark-observer.js"></script>${url.searchParams.has('e2e') ? '<script src="/e2e-observer.js"></script>' : ''}`);
    }
    const compress = /gzip/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store',
      ...(compress ? { 'Content-Encoding': 'gzip' } : {}) });
    res.end(compress ? gzipSync(body) : body);
  } catch { res.writeHead(404); res.end(); }
}).listen(port, '127.0.0.1', () => console.log(`Simulated benchmark: http://127.0.0.1:${port} (${root})`));
