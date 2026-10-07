/**
 * GMV Syncromatics integration settings for the UNC P2P portal.
 */

const GMV_BASE_URL = 'https://api.syncromatics.com/portal';

/** GMV route id → app route. */
const ROUTES = {
  6566: { id: 'P2P_EXPRESS', name: 'P2P Express' },
  6564: { id: 'BAITY_HILL', name: 'Baity Hill' },
};

/**
 * Pattern shown when no buses are running and none has been seen since the server started.
 * Confirmed 2026-09-14 during service hours: both routes are running the base variants
 * (25545 / 25535), not the "Granville Closed" variants (31799 / 31798) — the detour has ended.
 */
const DEFAULT_PATTERN = { P2P_EXPRESS: 25545, BAITY_HILL: 25535 };

/** Multiply GMV `speed` by this to get m/s. Confirmed mph against live vehicles on 2026-09-14
 *  (distance-traveled-vs-reported-speed ratio ~0.48, closest to the mph factor 0.44704). */
const SPEED_TO_MPS = 0.44704;

const NETWORK_TTL_MS = 6 * 60 * 60 * 1000;
/** A failed load must not block route browsing for the successful-data TTL. */
const NETWORK_ERROR_TTL_MS = 30 * 1000;
/** Extra time static data may be served after a failed refresh (18 h total, under the 24 h license limit). */
const NETWORK_STALE_MS = 12 * 60 * 60 * 1000;
/** GMV asks consumers to poll vehicles no more often than every 6 seconds. */
const SNAPSHOT_TTL_MS = 6 * 1000;
/** How long the last good snapshot is served as 'degraded' after a failed refresh. */
const SNAPSHOT_STALE_MS = 30 * 1000;
const MESSAGES_TTL_MS = 60 * 1000;
const MESSAGES_STALE_MS = 5 * 60 * 1000;
/** A vehicle whose lastUpdated is older than this is marked stale. */
const STALE_VEHICLE_SEC = 90;
const REQUEST_TIMEOUT_MS = 5000;

module.exports = {
  GMV_BASE_URL,
  ROUTES,
  DEFAULT_PATTERN,
  SPEED_TO_MPS,
  NETWORK_TTL_MS,
  NETWORK_ERROR_TTL_MS,
  NETWORK_STALE_MS,
  SNAPSHOT_TTL_MS,
  SNAPSHOT_STALE_MS,
  MESSAGES_TTL_MS,
  MESSAGES_STALE_MS,
  STALE_VEHICLE_SEC,
  REQUEST_TIMEOUT_MS,
};
