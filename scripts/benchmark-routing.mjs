/** Deterministic cold trip benchmark. Fake walks take 150 ms; no external API calls. */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ref = process.argv[2];
const load = async file => ref ? execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' }) : readFile(file, 'utf8');
async function moduleFrom(file) {
  const result = await build({ stdin: { contents: await load(file), resolveDir: path.resolve(path.dirname(file)), loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { computeTripOptions } = await moduleFrom('utils/multimodalRouting.ts');
const { makeNetwork, makeSnapshot } = await moduleFrom('tests/fixtures/transit.ts');
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : ['2026-09-16T01:00:00Z'])); }
  static now() { return new RealDate('2026-09-16T01:00:00Z').getTime(); }
};
let active = 0, peak = 0, requests = 0;
globalThis.fetch = async url => {
  peak = Math.max(peak, ++active); requests++;
  await new Promise(resolve => setTimeout(resolve, 150));
  active--;
  const params = new URL(url, 'http://localhost').searchParams;
  const from = params.get('from').split(',').map(Number), to = params.get('to').split(',').map(Number);
  const meters = Math.hypot((from[0] - to[0]) * 90000, (from[1] - to[1]) * 111000);
  return Response.json({ durationSec: meters / 1.4, distanceMeters: meters,
    geometry: { type: 'LineString', coordinates: [from, to] }, steps: [] });
};
const network = makeNetwork(), snapshot = makeSnapshot();
const runs = [];
for (let i = 0; i < 3; i++) {
  // Different origin/destination each time avoids a warm cache while sharing stop geometry.
  const offset = i * .00003;
  requests = 0; peak = 0;
  const start = performance.now();
  const options = await computeTripOptions({ network, snapshot,
    origin: { lat: 35.9001 + offset, lon: -79.0401 + offset },
    destination: { id: 'benchmark', name: 'Example destination', lat: 35.9101 + offset, lon: -79.0401 + offset } });
  runs.push({ ms: Math.round(performance.now() - start), requests, peak,
    recommended: options.recommended, busMinutes: options.bus?.totalDurationMin, walkMinutes: options.walk?.totalDurationMin,
    stops: options.bus?.segments.filter(s => s.type === 'bus').map(s => [s.fromName, s.toName]) });
}
console.log(JSON.stringify({ ref: ref || 'working-tree', delayMs: 150, runs }, null, 2));
