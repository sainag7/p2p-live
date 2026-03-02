'use strict';

/**
 * moveunc-bus-scraper / scraper.js
 *
 * Direct REST API scraper for https://moveunc.com/arrivals
 *
 * The site is a Syncromatics transit portal (Portal ID 184) with a clean
 * RESTful JSON API — no browser or Puppeteer required.
 *
 * API chain discovered by live inspection:
 *   GET /Regions
 *   GET /Region/{regionID}/Routes
 *   GET /Route/{routeID}/Directions
 *   GET /Route/{routeID}/Direction/{directionID}/Stops
 *   GET /Stop/{stopID}/Arrivals
 *
 * Output: ./data/arrivals.json
 */

const fs   = require('fs');
const path = require('path');

const BASE_URL   = 'https://moveunc.com';
const OUTPUT_DIR = path.join(__dirname, 'data');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'arrivals.json');
const DELAY_MS   = 300; // ms between stop queries — be polite

const HEADERS = {
  'User-Agent' : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept'     : 'application/json, text/javascript, */*; q=0.01',
  'Referer'    : 'https://moveunc.com/arrivals',
  'X-Requested-With': 'XMLHttpRequest',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getJson(urlPath) {
  const url = `${BASE_URL}${urlPath}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const text = await res.text();
  if (!text || text.trim() === '') return [];
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 100)}`);
  }
}

function toArray(val) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return Object.values(val);
  return [];
}

// ── Main scrape ───────────────────────────────────────────────────────────────

async function scrape() {
  const results = [];
  const startTime = Date.now();

  console.log('='.repeat(56));
  console.log(' moveunc.com Bus Arrival Scraper');
  console.log(`  ${new Date().toLocaleString()}`);
  console.log('='.repeat(56));

  // ── Step 1: Get regions ────────────────────────────────────────────────────
  let regions;
  try {
    regions = toArray(await getJson('/Regions'));
  } catch (err) {
    console.error('✗ Could not fetch /Regions:', err.message);
    process.exit(1);
  }
  console.log(`\nRegions: ${regions.map(r => r.Name || r.ID).join(', ')}`);

  // ── Step 2: Routes per region ──────────────────────────────────────────────
  for (const region of regions) {
    const regionId = region.ID ?? 0;

    let routes;
    try {
      routes = toArray(await getJson(`/Region/${regionId}/Routes`));
    } catch (err) {
      console.warn(`  ⚠ Could not fetch routes for region ${regionId}:`, err.message);
      continue;
    }

    const enabled = routes.filter(r => r.ArrivalsEnabled !== false);
    console.log(`\nRoutes (${enabled.length} with arrivals enabled):`);

    // ── Step 3: Directions per route ─────────────────────────────────────────
    for (const route of enabled) {
      const routeId   = route.ID;
      const routeName = route.Name   || `Route ${routeId}`;
      const routeShort = route.ShortName || routeName;
      console.log(`\n  ▶ ${routeName} (${routeShort})`);

      let directions;
      try {
        directions = toArray(await getJson(`/Route/${routeId}/Directions`));
      } catch (err) {
        console.warn(`    ⚠ Could not fetch directions:`, err.message);
        continue;
      }

      // ── Step 4: Stops per direction ───────────────────────────────────────
      for (const direction of directions) {
        const dirId   = direction.ID   ?? direction.DirectionId ?? 0;
        const dirName = direction.Name || direction.DirectionName || `Direction ${dirId}`;

        let stops;
        try {
          stops = toArray(await getJson(`/Route/${routeId}/Direction/${dirId}/Stops`));
        } catch (err) {
          console.warn(`    ⚠ Could not fetch stops for direction ${dirId}:`, err.message);
          continue;
        }

        // Deduplicate stops by ID (some stops appear in multiple directions)
        const seen = new Set();
        const uniqueStops = stops.filter(s => {
          const id = s.ID ?? s.StopId;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });

        console.log(`    Direction "${dirName}": ${uniqueStops.length} stop(s)`);

        // ── Step 5: Arrivals per stop ────────────────────────────────────────
        for (const stop of uniqueStops) {
          const stopId   = stop.ID ?? stop.StopId;
          const stopName = stop.Name ?? stop.StopName ?? `Stop ${stopId}`;

          await sleep(DELAY_MS);

          // Response: [{RouteID, Arrivals: [{Minutes, BusName, RouteName, ...}]}]
          // Each stop returns ALL routes serving it, grouped by RouteID.
          let routeGroups = [];
          try {
            routeGroups = toArray(await getJson(`/Stop/${stopId}/Arrivals`));
          } catch (err) {
            // Many stops have no arrivals — that's normal, skip quietly
            continue;
          }

          // Flatten inner Arrivals arrays
          const flatArrivals = routeGroups.flatMap(group =>
            toArray(group.Arrivals || group.arrivals || [])
          );

          if (flatArrivals.length > 0) {
            console.log(`      ✓ "${stopName}": ${flatArrivals.length} arrival(s)`);
          }

          for (const a of flatArrivals) {
            // Minutes is a top-level integer on each inner arrival object
            let minutes = null;
            if (a.Minutes != null)               minutes = parseInt(a.Minutes, 10);
            else if (a.SecondsToArrival != null)  minutes = Math.round(a.SecondsToArrival / 60);
            else if (a.Seconds != null)           minutes = Math.round(a.Seconds / 60);

            results.push({
              // Use RouteName from the arrival itself — more accurate than parent route
              routeName            : a.RouteName || routeName,
              routeShortName       : routeShort,
              directionName        : dirName,
              stopName             : stopName,
              busName              : a.BusName || a.VehicleName || a.Name || 'Bus',
              minutesUntilArrival  : minutes,
              arriveTime           : a.ArriveTime || null,
              scheduledArriveTime  : a.ScheduledArriveTime || a.ScheduledTime || null,
              isRealTime           : !(a.SchedulePrediction ?? false),
              scrapedAt            : new Date().toISOString(),
            });
          }
        }
      }
    }
  }

  return results;
}

// ── Write output ──────────────────────────────────────────────────────────────

function writeOutput(arrivals) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const output = {
    lastUpdated   : new Date().toISOString(),
    totalArrivals : arrivals.length,
    arrivals,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
}

// ── Entry point ───────────────────────────────────────────────────────────────

(async () => {
  const t0 = Date.now();
  try {
    const arrivals = await scrape();
    writeOutput(arrivals);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log('\n' + '='.repeat(56));
    if (arrivals.length > 0) {
      console.log(`✓ Done in ${elapsed}s — ${arrivals.length} arrival(s) written to data/arrivals.json`);
    } else {
      console.log(`✓ Done in ${elapsed}s — 0 arrivals (buses may not be in service right now)`);
      console.log('  Routes and stops were fetched successfully.');
      console.log('  Try again during service hours to see live predictions.');
    }
    console.log('='.repeat(56));
  } catch (err) {
    console.error('\n✗ Scraper failed:', err.message);
    writeOutput([]);
    process.exit(1);
  }
})();
