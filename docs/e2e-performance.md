# End-to-end performance audit — October 5, 2026

The remaining waits are primarily network latency and animation duration. The tested mobile flows work, with no unexpected console errors, horizontal overflow, or main-thread tasks exceeding 50 ms in the confirmed samples. These observations do not establish performance on a low-end physical phone.

## What ran

The current production build on `codex/mobile-performance` was exercised at 390×844 through Home, search, nearest stops, address results, save/unsave place, walk/bus trip options, mode switching, trip refresh, starting/ending a walking journey, map entry, map options, stop browsing/selection, Home return, bus details, and bus refresh. A deliberately failed map-module download exposed Reload app and recovered after reloading. No runtime product fixes were made during this audit; changes are diagnostic scripts and reports.

Three broad flow repetitions and three corrected request-aware timing runs were recorded. Earlier address timings that matched stale rows were discarded; confirmed runs wait for each address request to finish. The illustrative Example Market saved place was removed through the UI. Test tabs were closed and temporary viewport overrides reset.

## Current timings

Three-run medians, milliseconds:

| Surface/action | Content ready | Finite animations finished |
| --- | ---: | ---: |
| Home bus data | 193.5 | 194.4 |
| Open search | 5.4 | 344.9 |
| First address search | 440.8 | 809.1 |
| Repeat the same address search | 444.7 | 720.6 |
| Cold trip options | 313.3 | 1,521.1 |
| Close search | 228.1 | 228.2 |
| First map-module entry in a document | 62.5 | 62.6 |
| Repeat map entry | 4.6 | 4.6 |

The broader flow's existing observer waits two animation frames after DOM readiness: bus details 11.8 ms, map options 12.2 ms, stop browser 12.1 ms, and bus refresh 167.8 ms. Differences of a few milliseconds between observers/runs are noise. Finite-animation completion is a visual settling metric, **not a period during which interactions are blocked**. The 1,200 ms trip comparison-bar animation explains most of the trip's additional visual settling time. Fixed-clock refresh reuses cached walks, so its short latency is not representative of a moved rider or expired walking cache.

### Deployed API samples

Three read-only pairs against `https://p2pnow.netlify.app`, spaced at least six seconds apart:

| Endpoint | Sample 1 | Sample 2 | Sample 3 | Median |
| --- | ---: | ---: | ---: | ---: |
| Route network | 275.8 | 259.0 | 304.2 | 275.8 |
| Live snapshot | 1,913.0 | 685.9 | 5,210.4 | 1,913.0 |

All six responses were HTTP 200. All three snapshots reported live with one vehicle. Network responses retained `public,max-age=300`; snapshots retained `no-store`. Timings include network connection and body reading from this machine. They belong to **deployed code**, not these uncommitted changes, and do not establish whether a hosting cold start occurred. No tokens or keys were provisioned/read for this audit.

## Improvements in priority order

1. **Live snapshot latency — highest impact.** The deployed range is 686–5,210 ms. Add timings around individual GMV vehicle, arrival and message requests to distinguish upstream latency from hosting/transport time. `server/gmv/service.cjs:getSnapshot` waits for messages alongside the vehicle core; a slow notice refresh can therefore delay otherwise available bus data. Consider decoupling notice refresh from that critical path while preserving expiry, last-good messages, unavailable/degraded status and the six-second provider polling limit. The existing code and five-second request timeout make this a candidate cause, not proof of which call caused the deployed slow sample.
2. **Repeated address search — clear local saving.** Both first and repeat searches take about 440 ms: the 280 ms debounce plus the simulated 150 ms API wait. `components/SearchSheet.tsx:useGeocode` has no successful-result cache. A bounded session cache keyed by normalized query and proximity would let repeats bypass both waits. Preserve cancellation, location-sensitive ordering and retry after errors. A shorter debounce could also help first results, with request volume measured before choosing its value.
3. **Trip animation duration — perceived responsiveness.** Options arrive in 313 ms but take 1,521 ms to visually settle. `components/TripResults.tsx:raceSec` caps its decorative comparison race at 1,200 ms, with related badge timing. Reduce that duration and row reveal delay together; keep labels and action buttons readable immediately, and retain reduced-motion behavior. This would improve perceived speed, not upstream routing latency.
4. **First map download on mobile — transfer remains substantial.** Observed renderer JavaScript transfers about 470 KB compressed, plus about 5.8 KB of CSS. Local renderer entry takes 63 ms, repeat entry 5 ms, but loopback transfer does not represent cellular download or tile rendering. Current pointer/focus preloading helps navigation intent; measure a token-enabled build on a throttled phone before choosing earlier idle prefetching, reducing optional map features, or further chunking. Earlier prefetching trades data/battery for first-map speed and should not compete with initial Home loading.
5. **Trip results can be progressively available.** The local plan waits for the bus search before publishing its completed options, although the direct walking leg starts concurrently. Consider showing a completed walk option while bus alternatives finish, with an explicit pending bus state and stable recommendation/focus. Preserve route selection and avoid silently presenting walking as the final recommendation too early.

Search opening and closing are already responsive; their measured remaining 345/228 ms waits are mainly intentional motion. Bus details, route controls and stop lists are already around a frame, so further memoization there has lower value than the items above.

## Conditions and limits

The UI used the current production build with the local diagnostic server, schematic transit fixtures, a fixed service clock, a simulated campus location and 150 ms API response delay. Walking geometry is illustrative and never enters production. There was no interaction CPU/network throttling. Home's cold mobile paint under Lighthouse remains documented separately in [performance.md](performance.md).

No Mapbox token was available in the build. Map-module loading, controls, stop sheets, and download failure recovery were verified; real tiles, camera behavior, 3D rendering, frame rate and memory were not. Real GPS and the external PDF viewer were not measured. The existing error boundary correctly displays the missing-token state. Automated geolocation never disclosed a real location.

Raw timings, sanitized request paths, long-task samples, broader flow interactions and public API samples are retained in [e2e-performance-results.json](e2e-performance-results.json). Local screenshots and exploratory artifacts are ignored under `artifacts/performance/e2e`.

## Reproduce

```bash
npm run build
node scripts/performance-server.mjs dist 4174
```

Open `http://127.0.0.1:4174/?e2e` at 390×844. Reload between runs. Open search, type `market`, wait for the Example Market address, clear and type it again, select it without first starring it (starring prefetches the plan behind the sheet), wait for trip options/animations, close, open Map, return Home and open Map again. Exercise the additional flows listed above. The DOM outputs `#e2e-observations` and `#benchmark-results` record diagnostics. `data-geocode-count` on the former lets automation wait for completed geocoding requests rather than stale rows.

The benchmark server only injects the extra diagnostic observer with `?e2e`; it is excluded from the production app. Request timings finish when fetch headers arrive, while feature readiness includes body parsing and React rendering. Resource transfer timings cover the map module and CSS. Finite animations are checked once per frame; the probe itself is instrumentation overhead, not field telemetry.

## Follow-up fixes

Implemented fixes and new benchmarks are documented in [performance-fixes.md](performance-fixes.md).
