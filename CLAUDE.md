# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run frontend only (port 3000)
npm run dev

# Run API server only (port 3001)
npm run server

# Run both concurrently
npm run dev:all

# Production build
npm run build

# Preview production build
npm run preview
```

There are no automated tests in this project.

## Environment Variables

Create `.env.local` with:
```
VITE_MAPBOX_TOKEN=pk.eyJ...   # Required: Mapbox tiles + client geocoding
MAPBOX_TOKEN=pk.eyJ...         # Required: Server-side Mapbox Directions API
GEMINI_API_KEY=AIzaSy...       # Optional: enables /api/ops/complaints/summary
```

See `.env.example` for the full list.

## Architecture

**Frontend** (Vite + React 18 + TypeScript, port 3000) with a **Node.js API server** (`server/index.cjs`, port 3001). Vite proxies all `/api/*` requests to the API server. Tailwind CSS is loaded via CDN (not PostCSS).

### Two apps in one repo

1. **Student app** (`App.tsx` → `RouterApp.tsx` at `/`) — bus tracking, trip planning, map visualization
2. **Ops dashboard** (`pages/ops/`) — role-gated dashboards for `admin`, `manager`, and `driver` roles at `/ops/*`

`RouterApp.tsx` is the root router. The ops system uses `RoleGuard.tsx` for route protection and fake localStorage-based auth (`ops/auth.ts`).

### Data is mostly mock

`data/` contains hardcoded buses, stops, routes, and ops stats. There is no real-time transit data source. `utils/multimodalRouting.ts` and `utils/routeInterpolation.ts` handle route planning and bus position interpolation against this mock data. The scraper directory (`scraper/`) is unused.

### API server (`server/index.cjs`)

Uses Node's native `http` module (not Express). Endpoints:
- `/api/mapbox/route` — Mapbox Directions for bus routes (6h cache)
- `/api/mapbox/directions/walk` — walking directions (15m cache)
- `/api/mapbox/geocode` — place search
- `/api/ops/complaints/summary` — Gemini LLM summary (POST, with fallback if key absent)
- `/api/arrivals` — deterministic hash-based mock arrivals
- `/healthz` — health check

### Ops persistence

Client-side only via IndexedDB (`storage/opsStorage.ts`): complaints, driver notes, timesheets. No server-side database. Auth is fake (hardcoded users in `ops/peopleStore.ts`).

### Key types

All domain types are in `types.ts`: `Stop`, `Route`, `Vehicle`, `Journey`, `JourneySegment`, `Destination`, `Coordinate`, `ViewState`.
