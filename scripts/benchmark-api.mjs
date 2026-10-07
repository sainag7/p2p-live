/** Compare raw API transfer bytes for a synthetic larger network; no live transit or credentials. */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';

process.env.NODE_ENV = 'production';
const require = createRequire(new URL('../server/index.cjs', import.meta.url));
const ref = process.argv[2];
let createApiServer;
if (ref) {
  const baseline = { exports: {} };
  const source = execFileSync('git', ['show', `${ref}:server/index.cjs`], { encoding: 'utf8' });
  new Function('require', 'module', source)(require, baseline);
  createApiServer = baseline.exports.createApiServer;
} else ({ createApiServer } = require('../server/index.cjs'));
const payload = { routes: [], stops: Array.from({ length: 500 }, (_, id) => ({ id, name: `Example stop ${id}`, lat: 35.9, lon: -79.04 })) };
const server = createApiServer({ gmvService: { getNetwork: async () => payload }, mapboxToken: undefined });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
try {
  const result = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.address().port, path: '/api/live/network', headers: { 'Accept-Encoding': 'gzip' } }, res => {
      let bytes = 0;
      res.on('data', chunk => { bytes += chunk.length; });
      res.on('end', () => resolve({ bytes, encoding: res.headers['content-encoding'] || 'identity', freshness: res.headers['cache-control'] }));
    }).on('error', reject);
  });
  console.log(JSON.stringify({ ref: ref || 'working-tree', fixtureStops: 500, ...result }, null, 2));
} finally { server.close(); await once(server, 'close'); }
