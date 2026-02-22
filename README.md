## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. **Environment variables:** Copy [.env.example](.env.example) to `.env.local` and set:
   - **`VITE_MAPBOX_TOKEN`** — Mapbox access token (required for the map view). Get one at [mapbox.com](https://www.mapbox.com/). Used only in the client for Mapbox GL JS.
   - **`GEMINI_API_KEY`** (optional) — For the Complaints LLM summary feature on the ops API server (`server/index.js`). **Never commit API keys.**
3. Run the app:
   - **Terminal 1:** `npm run dev` (Vite frontend)
   - **Terminal 2:** `npm run server` (Ops API server for `/api/ops/complaints/summary`)
   - Or run both with `npm run dev:all` if you have `concurrently` installed.
4. Open http://localhost:3000. The Manager → Complaints tab will show an LLM summary when the API server is running and `GEMINI_API_KEY` is set.
