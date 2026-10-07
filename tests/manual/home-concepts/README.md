# P2P Home concepts

Run `npm run dev` and open
<http://127.0.0.1:3000/tests/manual/home-concepts/>.

This is an isolated Vite entry. Production does not import these files. It uses
existing React and Lucide dependencies, local styles, and inline illustrative
data. No transit, location, or routing requests are made.

## Directions

- **A — Familiar, improved:** the earlier colored bus icons and cards, with a
  stronger nearby-stop card and an arrival on the right.
- **B — Catch your bus:** recommended for the chosen next-bus-first priority.
  One pale-blue arrival card contains the route, 56 px ETA, boarding stop,
  approximate walking time, and stop action.
- **C — Campus departures:** an open, divider-based board showing two arrivals
  at the same stop. Campus vehicle ETAs are clearly separated below it.

The example nearest-stop arrival is 8 minutes, with an approximate 3-minute
walk. Campus bus cards show predictions at each bus's own next stop instead.
Those are different predictions and are explicitly labeled.

## Controls

Use shared service state, phone width, and text-size controls. Each concept has
independent route filters. Filter selections affect its campus bus list only.
Arrival cards open local detail previews; Escape dismisses details and restores
focus. Navigation is visual context.

Standalone URLs accept `concept=A`, `concept=B`, or `concept=C`, plus
`state=running`, `state=before`, `state=unavailable`, or `state=location`.
The standalone preview fits the current screen, up to 390 px wide.

## Validation

- Browser-checked all three standalone concepts at 390×844 and 360×800.
- Equal 390×844 comparison previews verified; comparison stacks without page
  overflow on narrow screens.
- All three tested at 200% text size in 360 px previews; no horizontal clipping.
  Enlarged content remains scrollable, with no fixed content heights.
- At 360×800, the main stop/arrival area ends at approximately 468 px (A),
  565 px (B), and 578 px (C), above navigation beginning at 728 px.
- Both routes, either route alone, and neither route selected were exercised in
  the shared filter component. Concept A's selection left B and C unchanged.
- Keyboard Space activation, visible focus, stop/bus details, Escape dismissal,
  and focus restoration checked. Buttons have at least 44 px targets.
- Before-service state shows a large 7:00 PM and no arrival predictions.
  Unavailable tracking explicitly says buses may still be running and shows no
  stale predictions. Unknown location shows no nearby estimate and supports
  local stop browsing.
- No automatic animations; reduced-motion CSS also disables animation and
  smooth scrolling. Browser console reported no errors.
- Existing suite: 127 tests passed. Production build passed and generated the
  same application asset hashes as before this isolated prototype.
- Typecheck still reports the same 11 existing errors in the Three.js layer and
  staff components; none refer to the prototype. Existing build warnings about
  `/index.css` and large chunks remain.

The screenshots captured during verification were temporary local artifacts
and have been removed. Future captures can go in the ignored
`artifacts/home-concepts/` directory. All captures used demo data, not current
service.

No production change or deployment.
