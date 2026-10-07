/** The rider's location, kept up to date while the site is open on screen. */
import { useEffect, useRef, useState } from 'react';
import type { Coordinate } from '../types';
import { isNewSpot, type LocationReading } from '../utils/liveLocation';

const WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 };

export function useLiveLocation(fallback: Coordinate) {
  const [location, setLocation] = useState<Coordinate>(fallback);
  /** True once the phone has given a real position. */
  const [resolved, setResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const shown = useRef<LocationReading | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) { setLoading(false); return; }
    let watch: number | null = null;
    let denied = false;
    const onPosition = (p: GeolocationPosition) => {
      const reading: LocationReading = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy ?? Infinity, time: Date.now() };
      setResolved(true);
      setLoading(false);
      if (isNewSpot(shown.current, reading)) {
        shown.current = reading;
        setLocation({ lat: reading.lat, lon: reading.lon });
      }
    };
    const stop = () => { if (watch != null) navigator.geolocation.clearWatch(watch); watch = null; };
    const onError = (e: GeolocationPositionError) => {
      setLoading(false);
      if (e.code === e.PERMISSION_DENIED) { denied = true; stop(); }
    };
    const start = () => { if (watch == null && !denied) watch = navigator.geolocation.watchPosition(onPosition, onError, WATCH_OPTIONS); };
    // Phones stop sending positions to background tabs anyway; stop asking to save battery.
    const onVisibility = () => document.visibilityState === 'visible' ? start() : stop();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  return { location, resolved, loading };
}
