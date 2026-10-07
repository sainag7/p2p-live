/**
 * Shared live-transit state: loads the network once and polls the snapshot every 6 s
 * while the tab is visible (backing off on errors). Mounted once in RouterApp.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientLiveStatus, LiveSnapshot, LiveVehicle, StopArrival, TransitNetwork } from '../types';
import { fetchNetwork, fetchSnapshot } from '../utils/transitApi';
import { deriveClientStatus, nextPollDelayMs, visibleVehicles } from '../utils/livePolling';
import { getStopArrivals } from '../utils/arrivals';

const NETWORK_RETRY_MS = 30000;

export interface TransitContextValue {
  network: TransitNetwork | null;
  networkStatus: 'loading' | 'ready' | 'unavailable';
  snapshot: LiveSnapshot | null;
  status: ClientLiveStatus;
  /** Empty unless status is 'live' or 'degraded'. */
  vehicles: LiveVehicle[];
  /** Client clock (ms) when the current snapshot arrived. */
  snapshotReceivedAt: number | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

const TransitContext = createContext<TransitContextValue | null>(null);

export function TransitProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetwork] = useState<TransitNetwork | null>(null);
  const [networkStatus, setNetworkStatus] = useState<TransitContextValue['networkStatus']>('loading');
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const snapshotRequest = useRef<Promise<boolean> | null>(null);
  const networkRequest = useRef<Promise<void> | null>(null);
  const networkRetryTimer = useRef<ReturnType<typeof setTimeout> | undefined>();
  const refreshRequest = useRef<Promise<void> | null>(null);
  const mounted = useRef(false);

  const loadNetwork = useCallback(function load(): Promise<void> {
    if (networkRequest.current) return networkRequest.current;
    if (networkRetryTimer.current) clearTimeout(networkRetryTimer.current);
    setNetworkStatus('loading');
    networkRequest.current = (async () => {
      try {
        const next = await fetchNetwork();
        if (mounted.current) {
          setNetwork(next);
          setNetworkStatus('ready');
        }
      } catch {
        // A failed request never clears a previously loaded network.
        if (mounted.current) {
          setNetworkStatus('unavailable');
          networkRetryTimer.current = setTimeout(() => void load(), NETWORK_RETRY_MS);
        }
      } finally {
        networkRequest.current = null;
      }
    })();
    return networkRequest.current;
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadNetwork();
    return () => {
      mounted.current = false;
      if (networkRetryTimer.current) clearTimeout(networkRetryTimer.current);
    };
  }, [loadNetwork]);

  /** A manual refresh joins an ongoing poll, so completion means the data actually arrived. */
  const pollOnce = useCallback((): Promise<boolean> => {
    if (snapshotRequest.current) return snapshotRequest.current;
    snapshotRequest.current = (async () => {
      try {
        const next = await fetchSnapshot();
        if (mounted.current) {
          setSnapshot(next);
          setReceivedAt(Date.now());
        }
        return true;
      } catch {
        return false;
      } finally {
        snapshotRequest.current = null;
        if (mounted.current) {
          setAttempted(true);
          setClock(Date.now());
        }
      }
    })();
    return snapshotRequest.current;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const tick = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      const ok = await pollOnce();
      failures = ok ? 0 : failures + 1;
      if (!cancelled) timer = setTimeout(tick, nextPollDelayMs(failures));
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer) clearTimeout(timer);
      tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pollOnce]);

  const refresh = useCallback((): Promise<void> => {
    if (refreshRequest.current) return refreshRequest.current;
    setRefreshing(true);
    refreshRequest.current = Promise.all([pollOnce(), network ? Promise.resolve() : loadNetwork()])
      .then(() => undefined)
      .finally(() => {
        refreshRequest.current = null;
        if (mounted.current) setRefreshing(false);
      });
    return refreshRequest.current;
  }, [pollOnce, network, loadNetwork]);

  const status = deriveClientStatus(snapshot, receivedAt, clock, attempted);
  const value = useMemo<TransitContextValue>(
    () => ({
      network,
      networkStatus,
      snapshot,
      status,
      vehicles: visibleVehicles(snapshot, status),
      snapshotReceivedAt: receivedAt,
      refreshing,
      refresh,
    }),
    [network, networkStatus, snapshot, status, receivedAt, refreshing, refresh]
  );

  return <TransitContext.Provider value={value}>{children}</TransitContext.Provider>;
}

export function useTransit(): TransitContextValue {
  const value = useContext(TransitContext);
  if (!value) throw new Error('useTransit must be used inside <TransitProvider>');
  return value;
}

export function useStopArrivals(stopId: string | null, limit = 5): StopArrival[] {
  const { network, snapshot, status } = useTransit();
  return useMemo(
    () => (stopId ? getStopArrivals({ stopId, snapshot, status, network, now: new Date(), limit }) : []),
    [stopId, snapshot, status, network, limit]
  );
}
