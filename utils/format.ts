const FEET_PER_METER = 3.28084;
const METERS_PER_MILE = 1609.344;

export function formatDistanceImperial(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return '—';
  const absMeters = Math.abs(meters);

  const milesAbs = absMeters / METERS_PER_MILE;
  if (milesAbs < 0.25) {
    const feet = absMeters * FEET_PER_METER;
    const roundedFeet = Math.round(feet / 5) * 5;
    return `${roundedFeet} ft`;
  }

  const miles = absMeters / METERS_PER_MILE;
  const formatted =
    miles < 10 ? miles.toFixed(1) : miles < 100 ? miles.toFixed(1) : miles.toFixed(0);
  return `${formatted} mi`;
}

// Back-compat alias: keep internal callsites consistent while enforcing imperial display everywhere.
export const formatDistance = formatDistanceImperial;

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return '—';
  const totalMinutes = Math.max(0, Math.round(totalSeconds / 60));

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const minutesPart = minutes.toString().padStart(2, '0');

  if (minutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutesPart} min`;
}

/** Shift duration: "XX min" if <=59 min, else "X hr Y min" (no decimals). */
export function formatShiftDuration(totalMinutes: number | null | undefined): string {
  if (totalMinutes == null || !Number.isFinite(totalMinutes)) return '—';
  const min = Math.max(0, Math.floor(totalMinutes));
  if (min <= 59) return `${min} min`;
  const hours = Math.floor(min / 60);
  const mins = min % 60;
  return `${hours} hr ${mins} min`;
}

export function formatETA(
  durationSeconds: number | null | undefined,
  now: Date = new Date()
): string {
  if (durationSeconds == null || !Number.isFinite(durationSeconds)) return '—';

  const arrival = new Date(now.getTime() + durationSeconds * 1000);

  const timeStr = arrival.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  const sameDay =
    arrival.getFullYear() === now.getFullYear() &&
    arrival.getMonth() === now.getMonth() &&
    arrival.getDate() === now.getDate();

  if (sameDay) return timeStr;

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    arrival.getFullYear() === tomorrow.getFullYear() &&
    arrival.getMonth() === tomorrow.getMonth() &&
    arrival.getDate() === tomorrow.getDate();

  if (isTomorrow) return `${timeStr} (tomorrow)`;

  const diffDays = Math.round(
    (arrival.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) /
      (24 * 60 * 60 * 1000)
  );

  if (diffDays > 1) {
    return `${timeStr} (+${diffDays} days)`;
  }

  return timeStr;
}

/** Live ETA label: "Arriving" under a minute, otherwise whole minutes (floored). */
export function formatEta(etaSec: number | null | undefined): string {
  if (etaSec == null || !Number.isFinite(etaSec)) return '—';
  if (etaSec < 60) return 'Arriving';
  return `${Math.floor(etaSec / 60)} min`;
}

