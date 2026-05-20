/**
 * Admin Dashboard — System + Bus Performance Analytics (developers + infra).
 * Visual style matches the rest of P2P Live (cards, spacing, palette).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { OpsLayout } from '../../ops/OpsLayout';
import { StatCard } from '../../components/ops/StatCard';
import { AdminOptimizationCard } from '../../components/ops/AdminOptimizationCard';
import { useTransitData } from '../../hooks/useTransitData';
import { MOCK_COMPLAINTS, MOCK_SYSTEM_HEALTH, MOCK_LATENCY, MOCK_TRAFFIC, MOCK_ALERTS, ADMIN_OPTIMIZATION_DISPLAY } from '../../data/mockOps';
import { computeAdminMetrics, getCachedAdminMetrics, setCachedAdminMetrics, type AdminMetrics } from '../../utils/adminMetrics';
import { ShieldAlert } from 'lucide-react';

type DiagnosticsResponse = {
  env: { nodeEnv: string; mapboxTokenConfigured: boolean; geminiKeyConfigured: boolean; geminiModel: string };
  cache: { routeCacheEntries: number; walkCacheEntries: number };
  errors: { failedLlmCalls: number; directionsFailures: number; routeDirectionsFailures: number };
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  process: { pid: number; uptimeSec: number; node: string };
};

function formatKm(meters: number) {
  return `${(meters / 1000).toFixed(1)} km`;
}

export function OpsAdminPage() {
  const health = MOCK_SYSTEM_HEALTH;
  const alerts = MOCK_ALERTS;
  const { stops, vehicles, loading: transitLoading } = useTransitData();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(() => getCachedAdminMetrics());
  const [metricsLoading, setMetricsLoading] = useState(metrics == null);
  const [diag, setDiag] = useState<DiagnosticsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/diagnostics');
        if (!res.ok) return;
        const json = (await res.json()) as DiagnosticsResponse;
        if (!cancelled) setDiag(json);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (transitLoading) return;
    if (stops.length === 0 && vehicles.length === 0) return;
    let cancelled = false;
    (async () => {
      setMetricsLoading(metrics == null);
      try {
        const next = await computeAdminMetrics({
          stops,
          vehicles,
          complaints: MOCK_COMPLAINTS,
        });
        if (cancelled) return;
        setMetrics(next);
        setCachedAdminMetrics(next);
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitLoading, stops, vehicles]);

  const status = useMemo(() => {
    const p95 = metrics?.system.apiLatencyP95Ms ?? null;
    if (p95 == null) return { label: 'Checking…', dotClass: 'bg-gray-300', textClass: 'text-gray-500' };
    if (p95 < 180) return { label: 'Healthy', dotClass: 'bg-emerald-500', textClass: 'text-emerald-700' };
    if (p95 < 450) return { label: 'Degraded', dotClass: 'bg-amber-500', textClass: 'text-amber-700' };
    return { label: 'Critical', dotClass: 'bg-p2p-red', textClass: 'text-p2p-red' };
  }, [metrics]);

  const aiMetrics = useMemo(() => {
    const express = metrics?.routes.P2P_EXPRESS;
    const baity = metrics?.routes.BAITY_HILL;
    return {
      averageWalkTime: metrics?.optimization.averageWalkTimeMin,
      averageWaitTime: metrics?.optimization.averageWaitTimeMin,
      routeLengths: {
        'P2P Express': express?.distanceMeters,
        'Baity Hill': baity?.distanceMeters,
      },
      routeLoopDurationMin: {
        'P2P Express': express?.loopDurationMin,
        'Baity Hill': baity?.loopDurationMin,
      },
      congestionStops: [ADMIN_OPTIMIZATION_DISPLAY.mostCongestedStop.name],
      delayFrequency: {
        'P2P Express': express?.gpsDropoutsToday,
        'Baity Hill': baity?.gpsDropoutsToday,
      },
      gpsDropouts: {
        'P2P Express': express?.gpsDropoutsToday,
        'Baity Hill': baity?.gpsDropoutsToday,
      },
      etaAccuracy: {
        'P2P Express': express?.etaAccuracyPercent,
        'Baity Hill': baity?.etaAccuracyPercent,
      },
      system: {
        apiLatencyP95Ms: metrics?.system.apiLatencyP95Ms,
        directionsFailures: diag?.errors.directionsFailures,
        failedLlmCalls: diag?.errors.failedLlmCalls,
      },
    };
  }, [metrics, diag]);

  const statLatency = metrics?.system.apiLatencyP95Ms;
  const statWalk = metrics?.optimization.averageWalkTimeMin;
  const statWait = metrics?.optimization.averageWaitTimeMin;

  return (
    <OpsLayout title="Admin">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6 pb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">P2P Admin</h1>
            <p className="text-sm text-gray-500">
              Platform performance and system analytics.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-100 shadow-sm">
              <span className={`w-2.5 h-2.5 rounded-full ${status.dotClass}`} />
              <span className={`text-sm font-semibold ${status.textClass}`}>
                System Status: {status.label}
              </span>
            </div>
            {health?.uptimePercentToday != null && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-100 shadow-sm text-sm text-gray-700">
                <ShieldAlert size={16} className="text-p2p-blue" />
                <span>Uptime today: <span className="font-semibold">{health.uptimePercentToday.toFixed(2)}%</span></span>
              </div>
            )}
          </div>
        </div>

        {/* TOP ROW — Three equal-width cards: System Health, Latency, Traffic */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1) SYSTEM HEALTH */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">System Health</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">API status</span>
                <span className="font-semibold text-emerald-600">{health?.apiStatus === 'healthy' ? 'Healthy' : health?.apiStatus ?? 'Healthy'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Uptime</span>
                <span className="font-semibold text-p2p-blue">{(health?.uptimePercentToday ?? 99.97).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Last incident</span>
                <span className="font-medium text-gray-900">{health?.lastIncidentAt ? new Date(health.lastIncidentAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : 'Feb 20, 2025, 2:00 PM'}</span>
              </div>
              {health?.lastIncidentMessage && (
                <p className="text-xs text-gray-500 pt-1 border-t border-gray-100">{health.lastIncidentMessage}</p>
              )}
            </div>
          </div>

          {/* 2) LATENCY */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">Latency</h2>
            {(() => {
              const p50 = metrics?.system?.apiLatencyP95Ms != null ? Math.round(metrics.system.apiLatencyP95Ms * 0.35) : MOCK_LATENCY.p50Ms;
              const p95 = metrics?.system?.apiLatencyP95Ms ?? MOCK_LATENCY.p95Ms;
              const p99 = metrics?.system?.apiLatencyP95Ms != null ? Math.max(p95 + 1, Math.round(p95 * 2.2)) : MOCK_LATENCY.p99Ms;
              const err = MOCK_LATENCY.errorRatePercent;
              const maxMs = Math.max(p50, p95, p99, 300);
              return (
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">p50 (ms)</span>
                      <span className="font-semibold text-emerald-600">{p50}</span>
                    </div>
                    <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (p50 / maxMs) * 100)}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">p95 (ms)</span>
                      <span className="font-semibold text-p2p-blue">{p95}</span>
                    </div>
                    <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-p2p-blue rounded-full" style={{ width: `${Math.min(100, (p95 / maxMs) * 100)}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">p99 (ms)</span>
                      <span className="font-semibold text-amber-600">{p99}</span>
                    </div>
                    <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, (p99 / maxMs) * 100)}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Error rate (%)</span>
                      <span className="font-semibold text-p2p-blue">{err.toFixed(2)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-p2p-blue rounded-full" style={{ width: `${Math.min(100, (err / 0.5) * 50)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 3) TRAFFIC */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">Traffic</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Active users</span>
                <span className="font-semibold text-p2p-blue">{MOCK_TRAFFIC.activeUsers}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Requests/min</span>
                <span className="font-semibold text-p2p-blue">{MOCK_TRAFFIC.requestsPerMin}</span>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Top endpoints</p>
                <ul className="space-y-2">
                  {MOCK_TRAFFIC.topEndpoints.map((ep) => (
                    <li key={ep.path} className="flex justify-between items-center">
                      <span className="text-gray-600 font-mono text-xs">{ep.path}</span>
                      <span className="font-semibold text-gray-900">{ep.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Recent Alerts (full width below top row) */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Recent Alerts</h2>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <ul className="divide-y divide-gray-50">
              {alerts.map((a) => (
                <li key={a.id} className="px-4 py-3 flex items-center gap-3">
                  <span className={`shrink-0 w-2 h-2 rounded-full ${a.severity === 'critical' ? 'bg-p2p-red' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-p2p-blue'}`} />
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.severity === 'critical' ? 'bg-p2p-red/10 text-p2p-red border border-p2p-red/20' : a.severity === 'warning' ? 'bg-amber-500/10 text-amber-800 border border-amber-500/20' : 'bg-p2p-blue/10 text-p2p-blue border border-p2p-blue/20'}`}>{a.severity}</span>
                  <span className="text-sm text-gray-700 flex-1">{a.message}</span>
                  <span className="text-xs text-gray-400">{new Date(a.at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Optimization Metrics — walk/wait + congested / underutilized highlights */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Optimization Metrics</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="Average walk time" value={statWalk != null ? `${statWalk.toFixed(1)} min` : '4.3 min'} accent="blue" />
            <StatCard label="Average wait time" value={statWait != null ? `${statWait.toFixed(1)} min` : '5.7 min'} accent="purple" />
            <StatCard label="Most congested stop" value={ADMIN_OPTIMIZATION_DISPLAY.mostCongestedStop.name} accent="amber" />
            <StatCard label="Underutilized stop" value={ADMIN_OPTIMIZATION_DISPLAY.mostUnderutilizedStop.name} accent="green" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 border-l-amber-500">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Most Congested Stop</h3>
              <p className="font-bold text-gray-900 text-lg">{ADMIN_OPTIMIZATION_DISPLAY.mostCongestedStop.name}</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Average dwell time</span>
                  <span className="font-semibold text-amber-600">{ADMIN_OPTIMIZATION_DISPLAY.mostCongestedStop.averageDwellTimeSec} sec</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Boardings/hour</span>
                  <span className="font-semibold text-p2p-blue">{ADMIN_OPTIMIZATION_DISPLAY.mostCongestedStop.boardingsPerHour}</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 border-l-emerald-500">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Most Underutilized Stop</h3>
              <p className="font-bold text-gray-900 text-lg">{ADMIN_OPTIMIZATION_DISPLAY.mostUnderutilizedStop.name}</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Boardings/hour</span>
                  <span className="font-semibold text-p2p-blue">{ADMIN_OPTIMIZATION_DISPLAY.mostUnderutilizedStop.boardingsPerHour}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Avg wait impact</span>
                  <span className="font-semibold text-emerald-600">{ADMIN_OPTIMIZATION_DISPLAY.mostUnderutilizedStop.waitImpact}</span>
                </div>
              </div>
            </div>
          </div>
          {metricsLoading && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-sm text-gray-500">
              Computing route distances and walk-time coverage…
            </div>
          )}
        </section>

        {/* SECTION 3 — Bus System Analytics */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Bus System Analytics</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {(['P2P_EXPRESS', 'BAITY_HILL'] as const).map((rid) => {
              const r = metrics?.routes[rid];
              const name = rid === 'P2P_EXPRESS' ? 'P2P Express' : 'Baity Hill';
              const loopMin = r?.loopDurationMin;
              const dist = r?.distanceMeters;
              const headway = r?.headwayMin;
              const wait = r?.averageWaitMin;
              return (
                <div key={rid} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-gray-900">{name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Active buses: <span className="font-semibold text-gray-700">{r?.activeBuses ?? 0}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-gray-500">Route efficiency</p>
                      <p className="text-lg font-bold text-p2p-blue">{r?.efficiencyScore != null ? `${r.efficiencyScore}%` : rid === 'P2P_EXPRESS' ? '86%' : '79%'}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-500">Loop duration</p>
                      <p className="font-bold text-gray-900">{loopMin != null ? `${loopMin.toFixed(1)} min` : rid === 'P2P_EXPRESS' ? '18.2 min' : '22.5 min'}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-500">Route length</p>
                      <p className="font-bold text-gray-900">{dist != null ? formatKm(dist) : rid === 'P2P_EXPRESS' ? '4.2 km' : '5.1 km'}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-500">Headway</p>
                      <p className="font-bold text-gray-900">{headway != null ? `${headway.toFixed(1)} min` : rid === 'P2P_EXPRESS' ? '6.1 min' : '11.2 min'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Avg wait ≈ {wait != null ? `${wait.toFixed(1)} min` : rid === 'P2P_EXPRESS' ? '3.0 min' : '5.6 min'}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-500">Average fullness</p>
                      <p className="font-bold text-gray-900">{r?.averageFullnessPercent != null ? `${r.averageFullnessPercent}%` : rid === 'P2P_EXPRESS' ? '76%' : '68%'}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-500">GPS dropouts</p>
                      <p className="font-bold text-gray-900">{r?.gpsDropoutsToday != null ? r.gpsDropoutsToday : 0}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <p className="text-xs font-semibold text-gray-500">Tracker freezes</p>
                      <p className="font-bold text-gray-900">{r?.trackerFreezesToday != null ? r.trackerFreezesToday : rid === 'P2P_EXPRESS' ? 1 : 2}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION 4 — AI Route Optimization Suggestions */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">AI Route Optimization Suggestions</h2>
          <AdminOptimizationCard metrics={aiMetrics as any} />
        </section>

        {/* SECTION 5 — Developer Diagnostics */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Developer Diagnostics</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Environment</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                <li><span className="text-gray-500">NODE_ENV:</span> <span className="font-mono">{diag?.env?.nodeEnv ?? 'development'}</span></li>
                <li><span className="text-gray-500">Mapbox token:</span> <span className="font-semibold">{diag?.env?.mapboxTokenConfigured ? 'configured' : 'missing'}</span></li>
                <li><span className="text-gray-500">Gemini key:</span> <span className="font-semibold">{diag?.env?.geminiKeyConfigured ? 'configured' : 'missing'}</span></li>
                <li><span className="text-gray-500">Gemini model:</span> <span className="font-mono">{diag?.env?.geminiModel ?? 'gemini-1.5-flash'}</span></li>
              </ul>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Cache</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                <li><span className="text-gray-500">Route cache entries:</span> <span className="font-mono">{diag?.cache?.routeCacheEntries ?? 0}</span></li>
                <li><span className="text-gray-500">Walk cache entries:</span> <span className="font-mono">{diag?.cache?.walkCacheEntries ?? 0}</span></li>
              </ul>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Runtime</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                <li><span className="text-gray-500">Memory (RSS):</span> <span className="font-mono">{diag?.memory?.rssMb ?? 280} MB</span></li>
                <li><span className="text-gray-500">Heap used:</span> <span className="font-mono">{diag?.memory?.heapUsedMb ?? 120} MB</span></li>
                <li><span className="text-gray-500">Uptime:</span> <span className="font-mono">{diag?.process?.uptimeSec ?? 0} s</span></li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </OpsLayout>
  );
}
