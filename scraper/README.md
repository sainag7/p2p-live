# UNC Bus Arrival Scraper

Standalone Node.js scraper that pulls live bus arrival predictions from
[moveunc.com/arrivals](https://moveunc.com/arrivals) and displays them in a
simple dashboard showing **how many minutes away each bus is**.

This is a **proof-of-concept / standalone tool** — it does not connect to or
modify the `p2p-live` application in any way.

---

## How it works

1. **Puppeteer** launches a headless Chrome browser and navigates to
   `moveunc.com/arrivals`.
2. It intercepts the AJAX requests the page fires as it steps through the
   cascading dropdowns (Service → Route → Direction → Stop).
3. It discovers the real API endpoint URLs, then calls them directly for every
   route/stop combination.
4. Results are saved to `data/arrivals.json`.
5. An **Express server** (port `3002`) serves the JSON via `/api/arrivals` and
   a live-updating HTML dashboard at `http://localhost:3002`.

---

## Requirements

- **Node.js 18+** (tested on v24.5.0) — for the built-in `fetch` API
- Internet access to moveunc.com

---

## Install

```bash
cd scraper
npm install
```

> **Note:** `npm install` downloads Puppeteer's bundled Chromium (~300 MB).
> To skip the download and use your existing Chrome instead, see the tip below.

---

## Run

### Option A — Full server (recommended)

```bash
npm start
```

Opens the Express server at **http://localhost:3002**.
The scraper runs once immediately, then every 30 seconds automatically.

Open `http://localhost:3002` in your browser to see the dashboard.

### Option B — One-off scrape (no server)

```bash
npm run scrape
```

Runs the scraper once and writes `data/arrivals.json`.
Useful for testing or cron job integration.

---

## Skip Chromium Download (use your Chrome)

If you have Google Chrome installed on macOS you can avoid the 300 MB
Chromium download:

```bash
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm start
```

Or set it permanently in your shell profile:

```bash
export PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

---

## Ports

| Service | Port |
|---------|------|
| p2p-live Vite dev server | 3000 |
| p2p-live Express API | 3001 |
| **This scraper server** | **3002** |

No conflicts.

---

## Output format (`data/arrivals.json`)

```json
{
  "lastUpdated": "2026-03-01T14:32:00.000Z",
  "totalArrivals": 12,
  "arrivals": [
    {
      "routeName": "P2P Express",
      "directionName": "Outbound",
      "stopName": "Hinton James / Horton",
      "busName": "Bus 204",
      "minutesUntilArrival": 3,
      "scheduledArriveTime": "2:35 PM",
      "scrapedAt": "2026-03-01T14:32:00.000Z"
    }
  ]
}
```

---

## Dashboard features

- **Color-coded cards** — 🟣 Arriving now · 🔴 <3 min · 🟠 3–7 min · 🟢 7+ min
- **Route filter** — narrow down to a single route
- **Auto-refreshes** every 30 seconds without a page reload
- Works on mobile too (responsive CSS grid)

---

## File structure

```
scraper/
├── package.json        dependencies & scripts
├── scraper.js          Puppeteer scraper (Phase 1 discovery + Phase 2 collection)
├── server.js           Express server + 30s scheduler
├── public/
│   └── index.html      live dashboard
├── data/               auto-created, gitignored
│   └── arrivals.json   scraped output
└── README.md           this file
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Error: Cannot find Chromium` | Run with `PUPPETEER_EXECUTABLE_PATH` env var pointing to your Chrome |
| Dashboard shows "Scraper starting up" | Wait ~60 seconds for first run |
| Dashboard shows "No arrivals found" | Buses may not be in service; check moveunc.com directly |
| Port 3002 already in use | `PORT=3003 npm start` |
| Scraper takes forever | The site may be slow — Puppeteer has a 120s timeout per run |
