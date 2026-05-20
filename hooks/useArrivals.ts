import { useEffect, useState } from 'react';
import type { Arrival } from '../types';
import { fetchArrivals, SyncromaticsError } from '../utils/syncromatics';

interface UseArrivalsState {
  arrivals: Arrival[];
  loading: boolean;
  error: string | null;
}

export function useArrivals(stopId: string | null, autoRefreshMs = 30_000): UseArrivalsState {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stopId) {
      setArrivals([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const load = async (initial: boolean) => {
      if (initial) setLoading(true);
      try {
        const next = await fetchArrivals(stopId, 3, { signal: controller.signal });
        if (cancelled) return;
        setArrivals(next);
        setError(null);
      } catch (err) {
        if (cancelled || (err as { name?: string }).name === 'AbortError') return;
        const msg =
          err instanceof SyncromaticsError
            ? err.message
            : err instanceof Error
            ? err.message
            : 'Failed to load arrivals';
        setError(msg);
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    };
    load(true);
    const intervalId = autoRefreshMs > 0 ? window.setInterval(() => load(false), autoRefreshMs) : null;
    return () => {
      cancelled = true;
      controller.abort();
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [stopId, autoRefreshMs]);

  return { arrivals, loading, error };
}
