# Campus map browser checks

Run the normal API server (`npm run server`) and Vite (`npm run dev`). Open
`http://localhost:3000/tests/manual/map.html`, then choose **Map**.

This is a local-only Vite test entry and is not imported by the production app or
included in the production build. It uses real network geometry. Location and
explicitly requested statuses are simulated; they are not a user's location.

Query parameters can be combined:

- `geo=campus` (default): simulated location near Student Union; real walking API.
- `geo=denied`: no location success, no nearby-stop card, walking disabled.
- `geo=outside`: simulated out-of-area location, campus overview and notice.
- `status=live`: two **Demo bus** vehicles on real route stops, example ETAs.
- `eta=<seconds>`: demo-vehicle ETA for `status=live`/`degraded` (default 120).
- `status=degraded`: delayed/stale presentation using the current API snapshot.
- `status=unavailable`: snapshot request returns 503.
- `status=loading`: snapshot request stays pending.
- `status=no-service`: successful snapshot with no reporting vehicles.
- `beforeService`: simulated 2 PM Eastern, no-service snapshot.
- `walkFailure`: pedestrian request returns 503; no fabricated geometry.
- `reducedMotion`: emulates the reduced-motion preference for map animations.
- `duringService`: simulated 9 PM Eastern for operating-hours checks.
- `networkFailures=1`: fail the first network request, then recover on Retry or
  the automatic 30-second retry. Works with real geometry or `fixtureNetwork`.
- `networkUnavailable`: fail every route-network request; live status is independent.
- `trackingFailsAfterLoad`: return unavailable tracking after the first snapshot,
  while route-network requests continue to succeed.
- `fixtureNetwork`: use the small schematic Stop A–E test network when the live
  network API is unavailable. Combine with `status=live` for stationary demo
  vehicles. These coordinates and arrivals are illustrative, not live service.

Examples:

- `/tests/manual/map.html?geo=denied&status=live&reducedMotion`
- `/tests/manual/map.html?geo=campus&walkFailure`
- `/tests/manual/map.html?geo=outside&status=unavailable`
- `/tests/manual/map.html?geo=denied&beforeService`

Check at 360×800, 390×844, 768×1024, and 1280×720. Toggle routes, select
nearby stops at the Student Union/Fetzer Gym corridor, use Browse stops by
keyboard, dismiss with Escape, open a bus badge, request walking directions,
and switch between 2D and 3D. Watch several polling cycles after panning to
ensure the camera stays where you put it. The route PDF remains an external
link to the existing UNC document.
