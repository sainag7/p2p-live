/** GMV cold-cache latency with synthetic upstream waits; no credentials or external calls. */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
const require = createRequire(new URL('../server/gmv/service.cjs', import.meta.url));
const sourceFile = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const slowNotices = process.argv.includes('--slow-notices');
let createGmvService;
if (sourceFile) {
  const module = { exports: {} };
  new Function('require', 'module', await readFile(sourceFile, 'utf8'))(require, module);
  ({ createGmvService } = module.exports);
} else ({ createGmvService } = require('./service.cjs'));
const fixture = {
  '/routes': [{ id: 6566, shortName: 'Express' }, { id: 6564, shortName: 'BH' }],
  '/routes/6566/patterns': [{ id: 100, name: 'P2P Express', shape: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' }],
  '/routes/6564/patterns': [{ id: 200, name: 'Baity Hill', shape: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' }],
  '/routes/6566/patterns/100/stops': [], '/routes/6564/patterns/200/stops': [],
  '/routes/6566/vehicles': [{ id: 9001, name: 'Bus 1', lat: 35.9, lon: -79.05, pattern_id: 100, lastUpdated: '2026-09-14T22:59:50Z' }],
  '/routes/6564/vehicles': [], '/routes/6566/patterns/100/arrivals': [], '/v2/messages': [],
};
const runs = [];
for (let run = 0; run < 5; run++) {
  const calls = [];
  const client = { async get(path) {
    calls.push(path);
    await new Promise(resolve => setTimeout(resolve, path === '/v2/messages' && slowNotices ? 2000 : path === '/routes/6564/vehicles' ? 450 : 150));
    if (!(path in fixture)) throw new Error(`Missing fixture: ${path}`);
    return structuredClone(fixture[path]);
  }, stats: () => ({}) };
  const service = createGmvService({ client, now: () => Date.parse('2026-09-14T23:00:00Z') });
  const start = performance.now();
  const [network, snapshot] = await Promise.all([
    service.getNetwork().then(value => ({ ms: performance.now() - start, value })),
    service.getSnapshot().then(value => ({ ms: performance.now() - start, value })),
  ]);
  const warmStart = performance.now();
  await Promise.all([service.getNetwork(), service.getSnapshot()]);
  runs.push({ networkMs: network.ms, snapshotMs: snapshot.ms, warmMs: performance.now() - warmStart,
    calls: calls.length, routeIds: network.value.routes.map(r => r.id), status: snapshot.value.status, messagesPending: snapshot.value.messagesPending || false });
}
const median = key => runs.map(r => r[key]).sort((a, b) => a - b)[2];
console.log(JSON.stringify({ baseline: sourceFile || 'working-tree', upstreamDelayMs: 150, slowEmptyRouteDelayMs: 450, noticeDelayMs: slowNotices ? 2000 : 150,
  medians: { networkMs: median('networkMs'), snapshotMs: median('snapshotMs'), warmMs: median('warmMs') }, runs }, null, 2));
