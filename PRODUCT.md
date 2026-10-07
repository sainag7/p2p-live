# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are UNC Chapel Hill students on or near campus who need to know when the next Point-to-Point (P2P) bus arrives, how to reach it, and how to plan an efficient trip across campus.

## Product Purpose

P2P Live helps students check live P2P bus timing, find how to get to the right stop, and optimize their route so they spend less time waiting and walking blindly.

Success means a student can quickly answer: when is the next bus, where do I catch it, and what’s the best way to get where I’m going.

## Positioning

Real-time P2P campus transit for riders: live vehicles, arrivals, stop discovery, and trip planning focused on UNC’s Point-to-Point service—not a generic city transit app.

## Operating Context

Used on phones while walking or waiting on campus. Core rider flows are Home (next ride / nearby), Plan Trip, and Map.

## Capabilities and Constraints

- Public rider app only for this design scope (Home, Plan Trip, Map, related sheets/banners).
- Live bus positions, ETAs, stops, route lines, and service messages come from GMV Syncromatics via the Node server.
- Map relies on Mapbox (`VITE_MAPBOX_TOKEN`).
- Route identity includes P2P Express (blue) and Baity Hill (red).
- Product name and logo lock: **P2P Live** as currently shown in the app.

## Brand Commitments

- Name/logo: **P2P Live** (preserve current wordmark/logo treatment).
- Visual direction for the rider app: mobile-app characteristics matching Apple’s iOS app styles (system-like typography, large titles, grouped surfaces, tab bar navigation), while preserving P2P / route color identity.

## Evidence on Hand

- Live and mock transit data, campus stops/landmarks, and the existing rider UI implementation in `App.tsx` and `components/`.
- Do not fabricate testimonials, ridership claims, or partnership proof.

## Product Principles

1. Answer the next-bus question in one glance.
2. Prefer phone-thumb reach and glanceable hierarchy over dense desktop layouts.
3. Keep route color meaning clear (Express vs Baity Hill).
4. Preserve P2P Live naming and logo; refine chrome, not identity.
5. Optimize for students in motion: short paths from ETA → walk → ride → destination.
