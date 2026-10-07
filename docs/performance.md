# Mobile performance pass — October 5, 2026

Baseline: `origin/passenger-ui-redesign` at `e411bed`. Changes are on `codex/mobile-performance`.

| Loading metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Lighthouse mobile performance | 69 | 99 | +30 points |
| First contentful paint | 4.97 s | 1.52 s | 69% faster |
| Largest contentful paint | 4.97 s | 1.67 s | 66% faster |
| Initial JavaScript, gzip | 565 KB | 93 KB | 84% smaller |
| Total initial transfer | 1.61 MB | 118 KB | 93% smaller |
| Cold routing benchmark | 1.22 s | 0.46 s | 62% faster |
| Larger synthetic network response | 30,303 bytes | 2,672 bytes | 91% smaller |

Three-run mobile interaction medians, in milliseconds:

| Surface/action | Before | After |
| --- | ---: | ---: |
| Home with bus data | 252.8 | 207.6 |
| Open search | 12.0 | 9.9 |
| Show nearest stops | 8.7 | 7.0 |
| Select Davis Library → trip results | 939.5 | 321.4 |
| Open bus details | 11.3 | 10.7 |
| Open map controls | 11.4 | 6.8 |
| Open map options | 9.9 | 7.2 |
| Browse stops | 8.7 | 9.2 |
| Return to Home | 10.5 | 9.5 |
| Refresh bus times | 165.1 | 162.1 |

Sub-frame differences are noise; the material gains are initial loading and trip planning. The stop-list timing remained effectively unchanged. Total blocking time stayed at 0 ms and layout shift stayed at 0.035 in the final audit medians. These are lab measurements, not field INP or real-device guarantees.

## What changed

- Compile the existing Tailwind theme during the build. Remove the external runtime compiler, unused import map, and broken stylesheet request.
- Load Mapbox and its CSS on map intent. Show a stable loading surface while the renderer downloads; route controls and stop sheets remain available. A failed module download offers an app reload, verified with a deliberately failed chunk request.
- Keep one map mounted after its first visit. Pause its bus/dash animation loops on Home, resize it when it becomes visible, and avoid rebuilding route/stop data on every GPS update. This trades retained WebGL memory for faster repeat visits.
- Replace the 1024 px favicon with a 48 px PNG derived from the same artwork. The original artwork remains available.
- Fetch independent walking legs concurrently with a shared four-request limit. Preserve nearest-first tie ordering and route selection. Keep existing in-memory walk reuse, bound client/server cache sizes, share identical in-flight walks on the API, and retry failures.
- Compress larger successful API responses while preserving network caching and snapshot `no-store`. Time out stalled requests so retry/backoff and loading states can recover.
- Memoize Home's boarding-stop calculation. Skip nearest-stop calculation while the search Places tab is open.
- Shorten search opening from 460 to 320 ms, closing from 400 to 220 ms, and reduce row reveal delays. Preserve immediate phone keyboard focus, focus restoration, and reduced-motion behavior. Pull-to-refresh ends when its request finishes, removing the artificial 900 ms minimum. Refresh joins an ongoing live poll rather than reporting completion early.

## Measurement conditions and limits

Lighthouse 13.5.0 audited production builds with cold caches: 412×823 mobile emulation, 4× simulated CPU slowdown, and its default simulated mobile connection (150 ms RTT, 1,638.4 Kbps throughput). Results use the median of three runs per build. Static responses use gzip, matching typical hosting transfer behavior; assets are served with `no-store` to make cold comparisons reproducible.

The local benchmark server supplies the same schematic test network, one example bus, a simulated campus location, a fixed 9 PM Eastern service clock, and 150 ms latency per API request. Walking geometry is illustrative straight-line data used only by the benchmark server. It never enters the production build. The favicon is included in total initial transfer; social-preview images are not requested during normal page loading.

Interaction runs used a verified 390×844 browser viewport without CPU/network emulation. Timings start at the click (navigation start for Home), wait for the relevant DOM content, then wait two animation frames. They do not include the full entrance animation or measure field INP. Map timing covers controls/stop sheets, **not tile rendering**. No Mapbox token or real GPS was used. Real Mapbox tiles, WebGL frame rate, low-end phone memory use, live GMV latency, Render cold starts, and field Core Web Vitals still require deployment/device validation. First map use now downloads the renderer on demand; its bytes are shifted out of initial Home loading, not eliminated.

The standalone routing benchmark uses three distinct cold origins/destinations at a fixed service time and 150 ms simulated walk latency. Before and after issued eight walking requests per plan and chose the same Stop B → Stop C bus itinerary (6 min bus trip / 14 min walk, bus recommended). Peak concurrency rose from one to four. The API transfer benchmark uses a synthetic 500-stop payload and counts raw response bytes over HTTP; its size is not a claim about the real GMV network.

## Reproduce

The baseline production build was copied before frontend edits to `artifacts/performance/before/dist`. For a fresh reproduction, build `e411bed` in a separate clean checkout, then point the current benchmark server at that build directory. Keep the baseline checkout unchanged while measuring the new build.

```bash
npm run build
node scripts/performance-server.mjs artifacts/performance/before/dist 4173
# In another terminal:
node scripts/performance-server.mjs dist 4174
```

Audit each server three times, saving JSON to `artifacts/performance/{before,after}/lighthouse-{1,2,3}.json`:

```bash
npm exec --yes --package=lighthouse@13.5.0 -- lighthouse http://127.0.0.1:4174 --only-categories=performance --output=json --output-path=artifacts/performance/after/lighthouse-1.json --chrome-flags='--headless --no-sandbox' --quiet
node scripts/benchmark-routing.mjs e411bed
node scripts/benchmark-routing.mjs
node scripts/benchmark-api.mjs e411bed
node scripts/benchmark-api.mjs
```

For browser interaction timings, reload each origin between runs. Open search → Nearest stops → Places → Davis Library → Close → bus details → Close → Map → Map options → Browse stops → Home → Refresh → Map → Home. The benchmark server exposes the timings in `#benchmark-results` (add `?metrics` to show its panel). Save three arrays to each side's `interactions.json`, and routing/API output to `routing.json`/`api.json`. Run `node scripts/summarize-performance.mjs` to regenerate [performance-results.json](performance-results.json). The browser script and simulated location/data are injected only by this local server. Use a fresh origin with `/?failMapOnce` to check map-chunk failure and reload recovery.

## Verification

- `npm run typecheck` — passed.
- `npm test` — all 193 tests passed across 26 files, including concurrency, identical route selection, API compression/freshness, request sharing, and retry after failure.
- `npm run build` — passed. Vite still reports the large deferred Mapbox chunk; it is absent from initial Home requests.
- `git diff --check` — passed. No lint script is configured.
- Browser checks: focused search input on opening, campus filtering, trip results, restored focus on closing, bus details, route controls, stop list, refresh, repeated navigation, retained hidden map, and failed module recovery. Layout checked at mobile and desktop widths.
- The Impeccable detector reported existing palette/radius/type documentation differences in incumbent styles. No new visual identity or unrelated styling changes were introduced.

Full Lighthouse JSON and verification screenshots are local, ignored artifacts under `artifacts/performance`. The compact checked-in [results](performance-results.json) preserve all three audit metric sets and interaction runs.

## Cold-start and preview follow-up

This follow-up compares against the first performance pass above. The frontend build is unchanged; the initial paint and interaction results above still describe that build. The new measurements target transit cache initialization and production-preview HTTP caching.

| Metric (milliseconds) | Before follow-up | After follow-up | Change |
| --- | ---: | ---: | ---: |
| Cold GMV route network | 452.6 | 303.3 | 33% faster |
| Cold GMV snapshot, one slow empty route | 602.7 | 451.4 | 25% faster |
| Warm in-memory network + snapshot | 0.07 | 0.10 | Both below 1 ms; noise |
| Preview cold HTML + initial JS/CSS | 317.8 | 315.9 | Effectively unchanged |
| Preview repeat HTML + initial JS/CSS | 306.6 | 152.3 | 50% faster |
| Preview repeat network requests | 3 | 1 | Asset revalidation eliminated |

Route metadata now loads alongside pattern discovery instead of adding an upstream round trip. Each route starts its arrival requests as soon as its own vehicles arrive, instead of waiting for the other route's vehicle list. Request counts remain nine in the fixture, outputs remain equivalent, existing cache TTLs/stale windows remain intact, and live snapshots still use `no-store`. Failed metadata requests can now have concurrent pattern requests already in flight; the existing error backoff still applies.

Production preview gives existing hashed build assets one-year immutable caching. Netlify deploy previews receive the same asset policy through `netlify.toml`. HTML continues to revalidate and API freshness headers remain separate. Vite already compresses preview responses; compression was verified rather than reimplemented. First visits still fetch the same initial assets, so this cache change improves repeated visits rather than cold transfer. Updated deployments get new asset filenames.

Cold transit results are five-run medians from fresh in-memory services with synthetic 150 ms upstream requests and a 450 ms empty Baity Hill vehicle request. The slower route models uneven upstream latency; equal-latency snapshot requests do not gain an entire request round trip. These are cache initialization timings, **not Render platform wake-up or Node process startup**. No live keys or production requests were used.

Preview results are five-run medians from actual `vite preview` HTTP responses and a small HTTP cache client with a fixed 150 ms delay before each network request. Each load fetches HTML, then initial JavaScript and CSS in parallel. The client follows immutable caching and ETag revalidation; repeated HTML is still checked. This measures the asset-loading phase, excluding execution, rendering, images and the deferred map, **not total browser navigation time**. Both repeat loads transfer zero body bytes; after the change, two conditional asset requests disappear. The script also verifies missing assets and HTML do not receive immutable caching. Deployed Netlify/Render timings require deployment validation.

Reproduce using the local baseline service saved before the follow-up, or the unchanged service from `e411bed`:

```bash
git show e411bed:server/gmv/service.cjs > /tmp/p2p-service-before.cjs
node scripts/benchmark-cold-start.mjs /tmp/p2p-service-before.cjs
node scripts/benchmark-cold-start.mjs
npm run build
node scripts/benchmark-preview.mjs --before
node scripts/benchmark-preview.mjs
```

Five-run raw measurements and HTTP headers are preserved in [cold-start-results.json](cold-start-results.json). Additional regression tests prove stop discovery starts before route metadata completes, Express arrivals start before Baity Hill vehicles complete, and preview caching applies only to existing versioned assets. Full tests, typecheck, build and diff checks passed.

The subsequent [end-to-end audit](e2e-performance.md) covers full mobile flows, visual settling, repeated address queries and deployed API samples, with prioritized remaining bottlenecks.

## Follow-up fixes

Implemented fixes and new benchmarks are documented in [performance-fixes.md](performance-fixes.md).
