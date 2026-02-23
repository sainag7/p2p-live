## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. **Environment:** Copy [.env.example](.env.example) to `.env.local`. Set **`VITE_MAPBOX_TOKEN`** (Mapbox access token) for the student map view; get one at [mapbox.com](https://www.mapbox.com/). Optionally set **`GEMINI_API_KEY`** for the ops Complaints LLM feature. **Never commit real keys.**
3. Run the app:
   - **Terminal 1:** `npm run dev` (Vite frontend)
   - **Terminal 2:** `npm run server` (Ops API server for `/api/ops/complaints/summary`)
   - Or run both with `npm run dev:all` if you have `concurrently` installed.
4. Open http://localhost:3000. The Manager → Complaints tab will show an LLM summary when the API server is running and `GEMINI_API_KEY` is set.
