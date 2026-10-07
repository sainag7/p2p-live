import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const sides = {};
for (const side of ['before', 'after']) {
  const base = `artifacts/performance/${side}`;
  const audits = await Promise.all([1, 2, 3].map(i => readJson(`${base}/lighthouse-${i}.json`)));
  const interactions = await readJson(`${base}/interactions.json`);
  const actionNames = [...new Set(interactions.flat().map(item => item.action))];
  const dir = side === 'before' ? `${base}/dist` : 'dist';
  const html = await readFile(`${dir}/index.html`, 'utf8');
  const entry = html.match(/<script[^>]+src="([^"]+\.js)"/)[1];
  const js = await readFile(path.join(dir, entry));
  const metricNames = ['first-contentful-paint', 'largest-contentful-paint', 'speed-index', 'total-blocking-time', 'cumulative-layout-shift'];
  sides[side] = {
    lighthouseVersion: audits[0].lighthouseVersion,
    throttling: audits[0].configSettings.throttling,
    screenEmulation: audits[0].configSettings.screenEmulation,
    initialJsGzipBytes: gzipSync(js).length,
    medianPerformanceScore: median(audits.map(audit => audit.categories.performance.score * 100)),
    medianMetrics: Object.fromEntries(metricNames.map(name => [name, median(audits.map(audit => audit.audits[name].numericValue))])),
    medianInitialTransferBytes: median(audits.map(audit => audit.audits['network-requests'].details.items.reduce((sum, request) => sum + request.transferSize, 0))),
    medianInteractionsMs: Object.fromEntries(actionNames.map(name => [name, median(interactions.flat().filter(item => item.action === name).map(item => item.ms))])),
    lighthouseRuns: audits.map(audit => ({ score: audit.categories.performance.score * 100,
      metrics: Object.fromEntries(metricNames.map(name => [name, audit.audits[name].numericValue])) })),
    interactionRuns: interactions,
    routing: await readJson(`${base}/routing.json`),
    api: await readJson(`${base}/api.json`),
  };
}
await mkdir('docs', { recursive: true });
await writeFile('docs/performance-results.json', JSON.stringify({ date: '2026-10-05', baseline: 'e411bed',
  method: 'Three cold Lighthouse mobile audits per build; three interaction runs at 390x844 with fixed service time and simulated data. API responses delayed 150ms. Interaction timings measure DOM readiness plus two animation frames, not field INP or full animation completion. No Mapbox token or real-device GPU benchmark.', ...sides }, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(sides).map(([side, data]) => [side, {
  score: data.medianPerformanceScore, initialJs: data.initialJsGzipBytes, transfer: data.medianInitialTransferBytes,
  metrics: data.medianMetrics, interactions: data.medianInteractionsMs,
  routingMs: median(data.routing.runs.map(run => run.ms)), apiBytes: data.api.bytes,
}])), null, 2));
