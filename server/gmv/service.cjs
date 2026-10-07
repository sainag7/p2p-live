/**
 * Builds the /api/live/network and /api/live/snapshot payloads from GMV, cached in memory only.
 */

const config = require('./config.cjs');
const { createTtlCache } = require('./cache.cjs');
const {
  normalizeStop,
  normalizePattern,
  normalizeVehicle,
  buildArrivalIndexes,
  attachUpcomingStops,
  normalizeMessage,
  isMessageActive,
} = require('./normalize.cjs');

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function createGmvService({
  client,
  cache = createTtlCache(),
  now = Date.now,
  routes = config.ROUTES,
  defaultPattern = config.DEFAULT_PATTERN,
} = {}) {
  const routeList = Object.entries(routes).map(([gmvId, r]) => ({ gmvId: Number(gmvId), id: r.id, name: r.name }));
  /** Route id → pattern id most recently reported by its buses (in memory only). */
  const lastSeenPattern = {};

  async function buildNetwork() {
    const stopsById = new Map();
    // Route metadata is independent of pattern/stop discovery: start both together.
    const [rawRoutes, routePatterns] = await Promise.all([
      client.get('/routes'),
      Promise.all(routeList.map(async (route) => {
        const rawPatterns = await client.get(`/routes/${route.gmvId}/patterns`);
        const patterns = await Promise.all(
          (Array.isArray(rawPatterns) ? rawPatterns : []).map(async (p) => {
            const rawStops = await client.get(`/routes/${route.gmvId}/patterns/${p.id}/stops`);
            for (const entry of Array.isArray(rawStops) ? rawStops : []) {
              if (entry && entry.stop && entry.stop.id != null) stopsById.set(String(entry.stop.id), normalizeStop(entry.stop));
            }
            return normalizePattern(p, rawStops);
          })
        );
        return { route, patterns };
      })),
    ]);
    const builtRoutes = routePatterns.map(({ route, patterns }) => {
      const raw = (Array.isArray(rawRoutes) ? rawRoutes : []).find((r) => r.id === route.gmvId) || {};
      return {
        id: route.id,
        gmvId: route.gmvId,
        name: route.name,
        shortName: raw.shortName || route.name,
        color: raw.color || null,
        textColor: raw.textColor || null,
        patterns,
      };
    });
    return { routes: builtRoutes, stops: [...stopsById.values()] };
  }

  function resolveDefaultPatternId(route) {
    const ids = route.patterns.map((p) => p.id);
    for (const candidate of [lastSeenPattern[route.id], defaultPattern[route.id]]) {
      if (candidate != null && ids.includes(candidate)) return candidate;
    }
    const named = route.patterns.find((p) => p.name === route.name);
    return named ? named.id : ids.length ? ids[0] : null;
  }

  async function getNetwork() {
    const { value } = await cache.getOrFetch('network', config.NETWORK_TTL_MS, buildNetwork, {
      staleMs: config.NETWORK_STALE_MS,
      errorTtlMs: config.NETWORK_ERROR_TTL_MS,
    });
    return { ...value, routes: value.routes.map((r) => ({ ...r, defaultPatternId: resolveDefaultPatternId(r) })) };
  }

  async function getMessages() {
    try {
      const { value } = await cache.getOrFetch(
        'messages',
        config.MESSAGES_TTL_MS,
        async () => {
          const raw = await client.get('/v2/messages');
          return (Array.isArray(raw) ? raw : [])
            .map((m) => normalizeMessage(m, routes))
            .filter((m) => m.global || m.routeIds.length > 0 || m.stopIds.length > 0);
        },
        { staleMs: config.MESSAGES_STALE_MS }
      );
      const t = now();
      return value.filter((m) => isMessageActive(m, t));
    } catch {
      return [];
    }
  }

  async function buildSnapshotCore() {
    const t = now();
    const activePatternIds = {};
    // Each route can fetch its arrivals as soon as its own vehicles arrive.
    const perRoute = await Promise.all(routeList.map(async (route) => {
      const raw = await client.get(`/routes/${route.gmvId}/vehicles`);
      const vehicles = (Array.isArray(raw) ? raw : []).map((v) => normalizeVehicle(v, route, t));
      const reported = vehicles.map((v) => v.patternId).filter((id) => id != null);
      if (reported.length > 0) lastSeenPattern[route.id] = mostCommon(reported);
      const patternIds = new Set(reported);
      if (vehicles.length > 0 && patternIds.size === 0) {
        const fallback = lastSeenPattern[route.id] ?? defaultPattern[route.id];
        if (fallback != null) patternIds.add(fallback);
      }
      if (patternIds.size > 0) activePatternIds[route.id] = reported.length > 0 ? mostCommon(reported) : [...patternIds][0];
      const groups = await Promise.all([...patternIds].map(async (patternId) => {
        try {
          return { routeId: route.id, arrivals: await client.get(`/routes/${route.gmvId}/patterns/${patternId}/arrivals`) };
        } catch {
          return { routeId: route.id, arrivals: [] };
        }
      }));
      return { vehicles, groups };
    }));
    const groups = perRoute.flatMap((r) => r.groups);
    const { byVehicle, byStop } = buildArrivalIndexes(groups);
    const vehicles = perRoute.flatMap((r) => r.vehicles).map((v) => attachUpcomingStops(v, byVehicle));

    return {
      fetchedAt: new Date(t).toISOString(),
      status: vehicles.length > 0 ? 'live' : 'no-service',
      activePatternIds,
      vehicles,
      arrivalsByStop: byStop,
    };
  }

  async function getSnapshot() {
    // Notices refresh in the background if slow; they must not hold up ready bus data.
    let noticeTimer;
    let completedNotices;
    const cachedMessages = () => {
      const last = cache.peek('messages');
      return last && now() - last.fetchedAt < config.MESSAGES_TTL_MS + config.MESSAGES_STALE_MS
        ? last.value.filter(m => isMessageActive(m, now())) : [];
    };
    const noticeBudgetMs = cache.peek('snapshot') ? 0 : 150;
    const noticesRequest = Promise.race([
      getMessages().then(messages => (completedNotices = { messages, messagesPending: false })),
      new Promise(resolve => {
        noticeTimer = setTimeout(() => {
          resolve({ messages: cachedMessages(), messagesPending: true });
        }, noticeBudgetMs);
      }),
    ]).finally(() => clearTimeout(noticeTimer));
    const [notices, core] = await Promise.all([
      noticesRequest,
      cache
        .getOrFetch('snapshot', config.SNAPSHOT_TTL_MS, buildSnapshotCore, { staleMs: config.SNAPSHOT_STALE_MS })
        .catch(() => null),
    ]);
    // Recheck expiry at response time, including a slow vehicle refresh.
    const responseNotices = { ...(completedNotices || notices), messages: cachedMessages() };
    if (!core) {
      return {
        fetchedAt: new Date(now()).toISOString(),
        status: 'unavailable',
        activePatternIds: {},
        vehicles: [],
        arrivalsByStop: {},
        ...responseNotices,
      };
    }
    return { ...core.value, status: core.stale ? 'degraded' : core.value.status, ...responseNotices };
  }

  function diagnostics() {
    return { ...client.stats(), cacheHits: cache.stats().hits };
  }

  return { getNetwork, getSnapshot, diagnostics };
}

module.exports = { createGmvService };
