# End-to-end performance fixes

Measured October 5, 2026 against the preceding [end-to-end audit](e2e-performance.md). These changes are local and have not been deployed.

## Results

All times are milliseconds. UI results are medians of three production-build runs at 390×844 with local fixtures and a 150 ms API delay. The slow-notice experiment uses five fresh server instances per version, a 2,000 ms notice response, 150 ms normal upstream responses and a 450 ms slow empty-route response.

| Measurement | Before | After |
| --- | ---: | ---: |
| Live snapshot with slow notices | 2,001 | 451 |
| First address results | 441 | 342 |
| Repeated address results | 445 | 8 |
| First usable trip option | 313 | 165 |
| Complete walking and bus options | 313 | 324 |
| Trip visually settled | 1,521 | 548 |
| Home bus data | 194 | 192 |
| First map renderer module | 63 | 70 |

Complete trip computation is effectively unchanged in this small sample; walking becomes usable sooner and the comparison finishes animating sooner. No improvement is claimed for Home or the first map module. Each address test made one upstream request for two identical searches.

A single Lighthouse spot check scored **99**, with FCP **1,507 ms**, LCP **1,657 ms**, and **0 ms** total blocking time under simulated mobile throttling. This is a spot check, not a new three-run median. Initial JavaScript remains about **93.4 KB gzip**; the roughly **470 KB gzip** map renderer remains deferred.

## Changes

- Bus snapshots give notices a 150 ms budget on cold requests, then return bus data with an explicit pending-notices state. Fetching continues, and the next normal poll includes completed notices. Existing active notices survive only within the existing 60-second cache plus five-minute stale window; expiry is checked again when returning the response. The six-second client poll interval is unchanged.
- Internal GMV timings retain at most 50 sanitized endpoint paths and durations. Requests taking at least one second emit a server warning. Query strings, credentials and response bodies are excluded. These timings can identify the actual source of deployed latency after release.
- Address searches use a bounded, five-minute session cache keyed by normalized query and location proximity. Repeats bypass the debounce and request. First searches use a 180 ms debounce. Failed and cancelled requests are not cached; late responses cannot replace a newer search.
- Walking directions appear while bus alternatives continue. Pending bus state is explicit, bus selection and refresh are disabled while incomplete, and walking can start immediately. Final recommendations and manual selections are preserved. Closing the sheet or starting a journey prevents late results from replacing the active view.
- The comparison animation lasts 220 ms, with shorter, capped row staggering. Map preloading also responds to focus or pointer intent on journey and nearest-stop actions.

## Verification and limits

All **201 tests across 27 files**, TypeScript checking, and the production build passed. No lint script is configured. Tests cover notice budgets, stale and expired messages, sanitized timing records, geocode cache limits/cancellation/retry, and progressive routing. Browser checks covered early walking starts, late bus completion, selection-preserving refresh, bus journey start/end, and mobile/desktop overflow. The build retains Vite's warning for the deferred map chunk.

These controlled results do not establish that the deployed 686–5,210 ms snapshot range has been eliminated. Upstream and hosting latency still need measurement after deployment. No Mapbox token was available, so real tile loading, camera behavior, frame rate and real GPS remain unverified. Address animation-settling samples are excluded because the original diagnostic observer crossed view transitions during rapid navigation; the observer now captures the original element.

Raw per-run measurements and conditions are in [performance-fixes-results.json](performance-fixes-results.json). Earlier cold-start and preview improvements remain in [performance.md](performance.md).

## Reproduce

```bash
npm run build
node scripts/performance-server.mjs dist 4174
node scripts/benchmark-cold-start.mjs --slow-notices
```

Open `http://127.0.0.1:4174/?e2e` at 390×844 and reload between runs. Search for `market`, repeat the query, select the address, wait for both trip options and animations, then open Map. Use `?e2e&slowBus` to verify that walking can start before bus alternatives finish. Diagnostic fixtures and observers are excluded from the production application.
