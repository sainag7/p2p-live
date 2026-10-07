export type ServiceRouteKey =
  | 'P2P_EXPRESS'
  | 'BAITY_HILL'
  | 'p2p-express'
  | 'baity-hill'
  | 'P2P Express'
  | 'Baity Hill';

export type CanonicalServiceRouteId = 'P2P_EXPRESS' | 'BAITY_HILL';

interface RouteServiceSchedule {
  startMinute: number;
  endMinute: number;
  frequencyMin: number;
  runsOnServiceDay: (serviceDay: number) => boolean;
}

const START_MINUTE = 19 * 60; // 7:00 PM
const END_MINUTE = 3 * 60; // 3:00 AM

const SCHEDULES: Record<CanonicalServiceRouteId, RouteServiceSchedule> = {
  P2P_EXPRESS: {
    startMinute: START_MINUTE,
    endMinute: END_MINUTE,
    frequencyMin: 20,
    runsOnServiceDay: () => true,
  },
  BAITY_HILL: {
    startMinute: START_MINUTE,
    endMinute: END_MINUTE,
    frequencyMin: 30,
    // service day uses Date#getDay(): 0 = Sunday ... 6 = Saturday
    runsOnServiceDay: (serviceDay) => serviceDay !== 0,
  },
};

function normalizeRouteId(route: ServiceRouteKey): CanonicalServiceRouteId | null {
  if (route === 'P2P_EXPRESS' || route === 'p2p-express' || route === 'P2P Express') return 'P2P_EXPRESS';
  if (route === 'BAITY_HILL' || route === 'baity-hill' || route === 'Baity Hill') return 'BAITY_HILL';
  return null;
}

function getServiceWindowContext(now: Date) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const isEveningWindow = minutes >= START_MINUTE;
  const isOvernightWindow = minutes <= END_MINUTE;
  const inServiceWindow = isEveningWindow || isOvernightWindow;

  if (!inServiceWindow) {
    return { inServiceWindow: false, serviceDay: now.getDay() };
  }

  // 12:00 AM–3:00 AM belongs to previous day's schedule.
  const serviceDay = isOvernightWindow ? (now.getDay() + 6) % 7 : now.getDay();
  return { inServiceWindow: true, serviceDay };
}

export function isRouteOperatingNow(route: ServiceRouteKey, now: Date = new Date()): boolean {
  const canonical = normalizeRouteId(route);
  if (!canonical) return false;
  const schedule = SCHEDULES[canonical];
  const { inServiceWindow, serviceDay } = getServiceWindowContext(now);
  if (!inServiceWindow) return false;
  return schedule.runsOnServiceDay(serviceDay);
}

export function getRouteFrequencyMin(route: ServiceRouteKey): number | null {
  const canonical = normalizeRouteId(route);
  if (!canonical) return null;
  return SCHEDULES[canonical].frequencyMin;
}

function serviceMinuteToDate(now: Date, serviceMinute: number): Date {
  const out = new Date(now);
  // 12:00 AM–3:00 AM belongs to the previous evening's service day, so anchor there.
  if (now.getHours() * 60 + now.getMinutes() <= END_MINUTE) {
    out.setDate(out.getDate() - 1);
  }
  if (serviceMinute >= START_MINUTE) {
    out.setHours(Math.floor(serviceMinute / 60), serviceMinute % 60, 0, 0);
  } else {
    out.setDate(out.getDate() + 1);
    out.setHours(Math.floor(serviceMinute / 60), serviceMinute % 60, 0, 0);
  }
  return out;
}

export function getUpcomingRouteArrivals(
  route: ServiceRouteKey,
  now: Date = new Date(),
  limit = 5
): number[] {
  const canonical = normalizeRouteId(route);
  if (!canonical || limit <= 0 || !isRouteOperatingNow(canonical, now)) return [];
  const schedule = SCHEDULES[canonical];
  const slots: number[] = [];
  const finalMinute = schedule.endMinute;

  for (let minute = schedule.startMinute; minute <= finalMinute + 24 * 60; minute += schedule.frequencyMin) {
    const serviceMinute = minute % (24 * 60);
    const departure = serviceMinuteToDate(now, serviceMinute);
    const etaMin = Math.ceil((departure.getTime() - now.getTime()) / 60000);
    if (etaMin < 0) continue;
    slots.push(etaMin);
    if (slots.length >= limit) break;
  }

  return slots;
}

export function getServiceResumeLabel(): string {
  return '7:00 PM';
}

/** When evening service next begins, today or tomorrow. */
export function nextServiceStart(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setHours(Math.floor(START_MINUTE / 60), START_MINUTE % 60, 0, 0);
  if (start.getTime() <= now.getTime()) start.setDate(start.getDate() + 1);
  return start;
}
