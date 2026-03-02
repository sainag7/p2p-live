'use strict';

/**
 * moveunc-bus-scraper / server.js
 *
 * Lightweight Express server that:
 *   1. Serves the static frontend from ./public/
 *   2. Exposes GET /api/arrivals  → returns cached arrivals.json
 *   3. Runs scraper.js as a child process every 30 seconds
 *
 * Port: 3002  (parent project uses 3000/3001 — no conflict)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3002;
const DATA_PATH = path.join(__dirname, 'data', 'arrivals.json');
const SCRAPER_PATH = path.join(__dirname, 'scraper.js');
const REFRESH_MS = 30 * 1000; // 30 seconds

// ── Static files (dashboard) ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API: arrivals data ────────────────────────────────────────────────────────
app.get('/api/arrivals', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (!fs.existsSync(DATA_PATH)) {
    return res.status(503).json({
      lastUpdated: null,
      totalArrivals: 0,
      arrivals: [],
      status: 'loading',
      message: 'Scraper is running for the first time, please wait ~30 seconds...',
    });
  }

  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const data = JSON.parse(raw);
    data.status = 'ok';
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read arrivals data', detail: err.message });
  }
});

// ── API: health check ─────────────────────────────────────────────────────────
app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    port: PORT,
    dataExists: fs.existsSync(DATA_PATH),
    scraperRunning,
    lastRun: lastRunAt,
  });
});

// ── Scraper runner ────────────────────────────────────────────────────────────
let scraperRunning = false;
let lastRunAt = null;

function runScraper() {
  if (scraperRunning) {
    console.log(`[${timestamp()}] Scraper already running — skipping cycle`);
    return;
  }

  scraperRunning = true;
  lastRunAt = new Date().toISOString();
  console.log(`[${timestamp()}] Starting scraper...`);

  const env = { ...process.env };
  // Pass through PUPPETEER_EXECUTABLE_PATH if set
  // (allows user to use their existing Chrome installation)

  execFile(
    'node',
    [SCRAPER_PATH],
    { timeout: 120_000, env },
    (err, stdout, stderr) => {
      scraperRunning = false;

      if (err) {
        console.error(`[${timestamp()}] Scraper error: ${err.message}`);
        if (stderr) console.error('stderr:', stderr.slice(0, 500));
      } else {
        const lines = stdout.trim().split('\n');
        const summary = lines[lines.length - 1]; // last line is the "Done" summary
        console.log(`[${timestamp()}] Scraper done: ${summary}`);
      }
    }
  );
}

function timestamp() {
  return new Date().toLocaleTimeString();
}

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('┌─────────────────────────────────────────┐');
  console.log('│     moveunc.com Bus Arrival Scraper      │');
  console.log('└─────────────────────────────────────────┘');
  console.log(`  Dashboard:  http://localhost:${PORT}`);
  console.log(`  API:        http://localhost:${PORT}/api/arrivals`);
  console.log(`  Refresh:    every ${REFRESH_MS / 1000}s`);
  console.log('');

  // Run once immediately, then on interval
  runScraper();
  setInterval(runScraper, REFRESH_MS);
});
