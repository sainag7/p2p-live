# GMV Syncromatics Live Data — Design

**Date:** 2026-09-14
**Status:** Approved in brainstorming, pending written-spec review
**Scope:** Replace all mock transit data in P2P Live with live data from the GMV Syncromatics RTPI API.

## 1. Goal

Today every piece of transit data in the app is fake: 4 hardcoded vehicles with static ETAs (`data/mockTransit.ts`), buses animated at a constant 6 m/s along Mapbox-generated lines (`components/MapboxMap.tsx`), schedule-math arrivals (`utils/serviceSchedule.ts`), hash-based fullness, and an unused random `/api/arrivals`. This project makes the rider app and trip planning run on real vehicle positions, predictions, capacity, route shapes, stops, and service messages from GMV, while degrading gracefully to the timetable when live data is unavailable.

## 2. Constraints

- **Licensing:** The key was provided by UNC Transportation / P2P (the GMV customer). The Syncromatics terms also prohibit storing API-derived data for more than 24 hours and sharing/reselling it. Therefore:
  - GMV data lives only in memory on the server; nothing is written to disk or a database.
  - Static GMV data is refreshed every 6 hours (served stale on errors for at most 18 hours total); live data for seconds.
  - GMV payloads are never logged.
  - Test fixtures are hand-written from the documented schemas, never recorded GMV responses.
  - Client-side caches of derived data must stay under 24h.
- **Key handling:** `GMV_RTPI_API_KEY` is a server-only env var (local `.env`, gitignored; Render environment in production). Never `VITE_`-prefixed, never returned in a response, never logged. `.env.example` lists the name with no value.
- **Rate:** GMV recommends polling vehicles no more often than every 6 seconds.
- **Hosting:** Frontend on Netlify (`/api/*` redirected to Render), backend is the plain Node `http` server in `server/index.cjs` on Render (free tier may sleep). No new infrastructure.

## 3. Verified API facts

Base URL `https://api.syncromatics.com/portal`, headers `Api-Key: <key>` and `Accept: application/json`. Verified against the live portal on 2026-09-14 (outside service hours, so vehicle/arrival payloads come from the official API Blueprint schemas).

| Data | Endpoint | Notes |
|---|---|---|
| Routes | `GET /routes` | 2 routes: `6564` Baity Hill (`#AD42FF`), `6566` P2P Express (`#383FFF`). Includes `textColor`, `shortName`. |
| Patterns (variants) | `GET /routes/{routeId}/patterns` | Each has `id`, `name`, `directionType` (`Loop`), `shape` (Google encoded polyline). Baity Hill: 25535 base, 29358 Halloween 2025, 31798 Granville Closed. Express: 25545 base, 25697 Football, 26465 Basketball, 29360 Halloween 2025, 30481 "Archived 4/11/2026", 31799 Granville Closed. |
| Ordered stops per pattern | `GET /routes/{routeId}/patterns/{patternId}/stops` | `[{ stopSequence, shapeDistanceTraveled (meters), stop: { id, lat, lon, name, stopCode }, routes }]` |
| Stops | `GET /stops`, `GET /routes/{routeId}/stops` | 45 stops. Route stop lists can contain duplicate ids (dedupe by id). Distinct stops can share a name (e.g. two "Student Union", two "Frat Court"). |
| Vehicles | `GET /routes/{routeId}/vehicles` | `{ id, name, lat, lon, headingDegrees, speed, capacity, passengerLoad (0–1), lastUpdated (ISO), shapeDistanceTraveled, pattern_id }` |
| Arrivals for a pattern | `GET /routes/{routeId}/patterns/{patternId}/arrivals` | `[{ vehicle: {...}, stop: {...}, secondsToArrival, schedulePrediction }]` — every vehicle→stop prediction on that pattern in one call. |
| Arrivals for a stop | `GET /stops/{stopId}/arrivals?count=&routeId=` | Not needed in v1 (pattern arrivals cover it). |
| Messages | `GET /v2/messages` | Active and upcoming messages with expanded route/stop assignments. Empty at time of writing. |
| GTFS | `/gtfs/schedule` returns 500 for this portal; GTFS-RT feeds exist but are not used. |

**To verify during service hours (7 PM–3 AM):** the unit of `speed` (doc example `65` — mph or km/h), the type of `schedulePrediction` (docs show both `"false"` and `false`; normalize both), and real `lastUpdated` cadence.

## 4. Architecture

Approach: **lazy TTL cache on the existing server; client polls one snapshot endpoint.** GMV is called only when a client asks, with in-flight dedupe, so GMV traffic is bounded (~4 calls per 6 s) regardless of rider count and is zero when nobody is using the app.

```
Browser (TransitProvider) ──every 6s while visible──▶ /api/live/snapshot ─┐
                         ──once at load────────────▶ /api/live/network  ─┤
                                                                           ▼
                                                  server/gmv (in-memory TTL cache, dedupe)
                                                                           ▼
                                                       api.syncromatics.com/portal
```

Rejected alternatives: an always-on poller with SSE push (polls with zero users; long-lived connections through the Netlify redirect are unreliable; Render free tier sleeps), and GTFS-Realtime (per-trip times need the static GTFS, which 500s for this portal).

## 5. Server — `server/gmv/`

CommonJS, no new dependencies (Node built-in `fetch`).

- **`client.cjs`** — `gmvGet(path)`: adds `Api-Key`, `Accept: application/json`, `Accept-Encoding: gzip`; 5 s timeout via `AbortController`; throws a typed error with status on non-2xx. Reads `process.env.GMV_RTPI_API_KEY`; if absent, throws a `MissingKey` error (and the server logs one warning at boot).
- **`cache.cjs`** — `getOrFetch(key, ttlMs, fetchFn, { staleMs })`: in-memory map; concurrent callers share one in-flight promise; on fetch failure returns the last good value if it is younger than `ttlMs + staleMs`, flagged as stale; otherwise rethrows.
- **`polyline.cjs`** — Google encoded-polyline decoder returning `[lng, lat][]`.
- **`config.cjs`** — `ROUTE_MAP = { 6566: 'P2P_EXPRESS', 6564: 'BAITY_HILL' }`; `DEFAULT_PATTERN = { P2P_EXPRESS: 31799, BAITY_HILL: 31798 }` — the "Granville Closed" variants, which are the newest patterns and assumed to be in effect; change to 25545 / 25535 (base variants) when the detour ends; an in-memory `lastSeenPattern` per route, updated whenever vehicles report a `pattern_id`.
- **`normalize.cjs`** — pure functions mapping GMV payloads to the app shapes below. Canonical route ids; stop ids as strings of GMV ids; `schedulePrediction` normalized to boolean; vehicle `stale = now - lastUpdated > 90 s`.
- **`service.cjs`** — `getNetwork()` and `getSnapshot()`.

### Endpoints (added to `server/index.cjs`)

**`GET /api/live/network`** — cached 6 h (static), stale-on-error allowed up to 12 h more (18 h total, under the 24 h limit), `Cache-Control: public, max-age=300`.

```ts
{
  routes: [{ id: 'P2P_EXPRESS' | 'BAITY_HILL', gmvId: number, name, shortName, color, textColor,
             defaultPatternId: number,
             patterns: [{ id, name, geometry: LineString, lengthMeters,
                          stops: [{ stopId, sequence, distAlong }] }] }],
  stops: [{ id, name, lat, lon, routeIds: RouteId[] }]
}
```

`defaultPatternId` = `lastSeenPattern` if known, else `DEFAULT_PATTERN`, else the pattern whose name equals the route name.

**`GET /api/live/snapshot`** — cached 6 s, `Cache-Control: no-store`.

Per request (on cache miss): `GET /routes/{id}/vehicles` for both routes in parallel → collect distinct `pattern_id`s → `GET /routes/{id}/patterns/{pid}/arrivals` for each → `GET /v2/messages` (own 60 s TTL).

```ts
{
  fetchedAt: string,
  status: 'live' | 'no-service' | 'degraded' | 'unavailable',
  activePatternIds: { P2P_EXPRESS?: number, BAITY_HILL?: number },
  vehicles: [{ id, name, routeId, patternId, lat, lon, heading, speed, distAlong,
               capacity, load, lastUpdated, stale,
               nextStopId, nextStopEtaSec, upcomingStops: [{ stopId, etaSec }] }],
  arrivalsByStop: { [stopId]: [{ routeId, vehicleId, etaSec, scheduled }] },   // sorted by etaSec
  messages: [{ id, title, body, routeIds: RouteId[], stopIds: string[], startsAt?, endsAt? }]
}
```

- `upcomingStops` = that vehicle's arrivals sorted by `etaSec`; `nextStop*` = the first.
- Status: `live` when vehicles fetched successfully (even if some are stale); `no-service` when fetched successfully with zero vehicles; `degraded` when serving a cached snapshot within 30 s after a failed refresh; `unavailable` beyond that or when the key is missing (empty vehicles/arrivals; messages if cached).

### Other server changes

- Removed at the end of the project: mock `/api/arrivals`, `/api/mapbox/route`, `server/routeWaypoints.json` (once no consumers remain).

## 6. Client data layer

- **Types (`types.ts`):** add `RouteId` (`'P2P_EXPRESS' | 'BAITY_HILL'`), `TransitNetwork`, `NetworkRoute`, `RoutePattern`, `NetworkStop`, `LiveSnapshot`, `LiveStatus`, `StopArrival`, `ServiceMessage`. Extend `Vehicle` with the live fields; ETAs become `etaSec`. The `'p2p-express'`/`'baity-hill'` spellings are removed from app code (`serviceSchedule.ts` keeps accepting them).
- **`utils/transitApi.ts`:** `fetchNetwork()`, `fetchSnapshot()` using the existing API base from `utils/api.ts`.
- **`TransitProvider` (context, mounted in `RouterApp.tsx`)** gives all rider surfaces one poller:
  - Loads the network once. Polls the snapshot every 6 s while `document.visibilityState === 'visible'`; pauses when hidden; fetches immediately on becoming visible.
  - Backoff on fetch errors: 6 s → 12 s → 30 s, reset on success.
  - Exposes `refresh()` — wired to the existing Refresh button (replacing the fake 800 ms delay in `App.tsx`).
  - Hooks: `useTransitNetwork()`, `useLiveSnapshot()`, `useStopArrivals(stopId)`.
- **`utils/arrivals.ts` — `getStopArrivals(stopId, snapshot, network, now)`:** returns live arrivals when status is `live`/`degraded` and the stop has entries; otherwise schedule arrivals from `serviceSchedule.ts`. Each arrival carries `source: 'live' | 'scheduled'` (GMV entries with `scheduled: true` are labeled scheduled). Sole source of arrivals for ClosestStopCard, StopPopup, and Plan Trip.
- **`utils/format.ts`:** `formatEta(etaSec)` → "Arriving" (< 60 s), "1 min", "N min".
- **Stop display names (`data/stopDisplayNames.ts`):** map GMV stop id → friendly name, seeded by matching the current `data/p2pStops.ts` names to GMV stops within ~40 m. Unmatched stops use GMV's name.
- **Removed:** `data/p2pStops.ts`, stop lists in `data/routeConfig.ts`, `VEHICLES`/`ROUTES` in `data/mockTransit.ts`, `mockFullnessPercent`, `utils/journey.ts`, route colors duplicated in `MapboxMap.tsx` (colors come from the network). Destinations/places data stays.

## 7. Behavior by surface

### Rider map (`MapboxMap.tsx`, `MapView.tsx`)
- Route lines from the active pattern geometry (`activePatternIds`, falling back to `defaultPatternId`), replacing Mapbox Directions lines. Keep the existing Baity/Express overlap splitting and direction arrows.
- Stops from the active pattern's ordered stops.
- Buses: remove even spacing and constant-speed simulation. Each vehicle renders at its reported position with its reported heading. Between snapshots, dead-reckon along its pattern geometry from `distAlong` at reported `speed` for at most one poll interval, then ease to the next reported position (reuse `utils/routeInterpolation.ts`). If the vehicle's pattern geometry is unknown, render at lat/lon without dead-reckoning. Stale vehicles render greyed and do not move.
- Bus icons keyed by canonical route id.

### Bus list and `BusDetailSheet`
- Live next stop + `formatEta`.
- Upcoming stops with live ETAs.
- Fullness `round(load × capacity) / capacity` (e.g. "18 / 48") with the existing visual; hidden if capacity is missing.

### Status and messages
- `LiveStatusBanner`: `no-service` → "No buses running — service starts 7 PM" (time from `serviceSchedule.ts`); `degraded` → "Live data delayed"; `unavailable` → "Live data unavailable — showing scheduled times". Hidden when `live`.
- `ServiceMessageBanner`: system-wide and route messages, dismissible per message id (sessionStorage). Stop-assigned messages render inside `StopPopup`.

### Stop ETAs (`ClosestStopCard`, `StopPopup`)
- Use `useStopArrivals`; each row labeled **Live** or **Scheduled**.

### Plan Trip (`utils/multimodalRouting.ts`, `PlanTripView.tsx`)
- Candidate board/alight stops come from each route's active pattern ordered stops.
- Wait = soonest live arrival at the board stop from a vehicle whose `upcomingStops` also include the alight stop later; if none, soonest live arrival at the board stop; if no live data, schedule (current behavior).
- Ride time = `eta(alight) − eta(board)` for the same vehicle when both are present; otherwise `(distAlong(alight) − distAlong(board), + lengthMeters if negative) / avgSpeed + dwell × stopsBetween`, with the existing 6 m/s and 20 s dwell as defaults.
- Bus segment geometry = pattern line sliced between board and alight `distAlong` (`sliceRouteByDistance`), handling loop wrap.
- Saved routes are unaffected (they store coordinates, not stop ids).

## 8. Phases

Each phase ships independently and leaves the app working.

0. **Prerequisites:** cherry-pick `22fd843` (restores `utils/serviceSchedule.ts`, fixes post-midnight ETAs); add `GMV_RTPI_API_KEY` to local `.env` and (name only) to `.env.example`; user sets it in Render.
1. **Server:** `server/gmv/*`, `/api/live/network`, `/api/live/snapshot`, and tests. No UI change.
2. **Rider map, bus list, bus detail:** types, `TransitProvider`, stop display names, migrate *all* consumers of `p2pStops`/`STOPS`/`VEHICLES` to network data and canonical ids, live map rendering, `LiveStatusBanner`, working Refresh.
3. **Stop ETAs + messages:** `utils/arrivals.ts`, `useStopArrivals`, ClosestStopCard, StopPopup, `ServiceMessageBanner`.
4. **Plan Trip:** live wait and ride time, pattern-sliced geometry.
5. **Cleanup:** remove `/api/arrivals`, `/api/mapbox/route`, `routeWaypoints.json`, unused mocks, and `utils/journey.ts`.

## 9. Error handling summary

| Situation | Server | Client |
|---|---|---|
| Outside service hours | `no-service`, empty vehicles | No buses; banner with start time; scheduled ETAs |
| GMV error, last good < 30 s old | `degraded`, last snapshot | Buses shown; "Live data delayed" |
| GMV error beyond that / key missing | `unavailable`, empty | "Live data unavailable — showing scheduled times" |
| Our server unreachable / cold start | — | Backoff polling; network-load failure shows the unavailable banner and an empty map (same as today when `/api/mapbox/route` fails) |
| Vehicle not updated > 90 s | `stale: true` | Greyed, not animated |
| Vehicle on a pattern not in network | Normal | Rendered at lat/lon, no dead-reckoning |

## 10. Testing

- Add **Vitest** and an `npm test` script (covers TS client code and CJS server modules).
- **Server:** polyline decoding against a known vector; normalizers; arrivals grouping into `upcomingStops`/`arrivalsByStop`; status derivation; cache dedupe and stale-on-error (GMV stubbed via injected `fetch`).
- **Client:** `getStopArrivals` live/scheduled fallback; `formatEta`; Plan Trip wait/ride math including loop wrap; stop display-name matching.
- **Fixtures:** hand-written from the documented schemas only.
- **Live verification (7 PM–3 AM):** compare positions and ETAs against P2P's official tracker at a few stops; confirm `speed` units and `schedulePrediction` type.

## 11. Rollout

1. Set `GMV_RTPI_API_KEY` in Render.
2. Deploy backend (new endpoints are additive).
3. Deploy frontend (existing Netlify `/api/*` redirect reaches Render).

Repeat per phase.

## 12. Out of scope

Server push (SSE/websockets), any persistence of GMV data, GTFS/GTFS-RT, occupancy prediction, stop-code/RTPI-number lookups.
