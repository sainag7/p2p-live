export type TimesheetEntry = {
  id: string;
  driverId: string;
  driverName: string;
  date: string; // YYYY-MM-DD
  shiftStart: number; // ms
  shiftEnd: number; // ms
  durationMinutes: number;
  routeName: 'P2P Express' | 'Baity Hill';
  percentRouteCompleted: number; // can exceed 100
  notes?: string;
  breaks?: string;
  overrideFlags?: string[];
};

export type ScheduleShiftBlock = {
  personId: string;
  personName: string;
  role: 'driver' | 'manager';
  routeName?: 'P2P Express' | 'Baity Hill';
  shiftStart: number; // ms
  shiftEnd: number; // ms
};

export type ScheduleDay = {
  date: string; // YYYY-MM-DD
  blocks: ScheduleShiftBlock[];
};

const KEY_TIMESHEETS = 'p2p_timesheets_v1';
const KEY_SCHEDULE = 'p2p_schedule_v1';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededInt(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function atLocalTime(baseDate: Date, hour: number, minute: number) {
  const d = new Date(baseDate);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

export function getSeededTimesheets(): TimesheetEntry[] {
  try {
    const raw = localStorage.getItem(KEY_TIMESHEETS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TimesheetEntry[]) : [];
  } catch {
    return [];
  }
}

export function getSeededSchedule(): ScheduleDay[] {
  try {
    const raw = localStorage.getItem(KEY_SCHEDULE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScheduleDay[]) : [];
  } catch {
    return [];
  }
}

function setSeededTimesheets(entries: TimesheetEntry[]) {
  localStorage.setItem(KEY_TIMESHEETS, JSON.stringify(entries));
}

function setSeededSchedule(days: ScheduleDay[]) {
  localStorage.setItem(KEY_SCHEDULE, JSON.stringify(days));
}

export function ensureSeededTimesheetsAndSchedule(opts: {
  drivers: { id: string; name: string }[];
  managers: { id: string; name: string }[];
  seed?: number;
}): void {
  const existingTimesheets = getSeededTimesheets();
  const existingSchedule = getSeededSchedule();
  if (existingTimesheets.length > 0 && existingSchedule.length > 0) return;

  const seed = opts.seed ?? 1337;
  const rng = mulberry32(seed);

  const drivers = opts.drivers.slice(0, 12);
  const managers = opts.managers.slice(0, 6);
  const routeNames: Array<'P2P Express' | 'Baity Hill'> = ['P2P Express', 'Baity Hill'];

  // Past 14 days (including today): 2–6 shifts per day
  const timesheets: TimesheetEntry[] = [];
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    const date = isoDate(d);
    const shiftsToday = seededInt(rng, 2, 6);
    for (let i = 0; i < shiftsToday; i++) {
      const routeName = routeNames[seededInt(rng, 0, routeNames.length - 1)];
      const driver = drivers[seededInt(rng, 0, Math.max(0, drivers.length - 1))] ?? {
        id: 'driver-unknown',
        name: 'Unknown Driver',
      };

      const startHour = seededInt(rng, 7, 20);
      const startMin = seededInt(rng, 0, 3) * 15;
      const durationMinutes = seededInt(rng, 30, 120);
      const start = atLocalTime(d, startHour, startMin);
      const end = start + durationMinutes * 60000;

      const percentRouteCompleted = seededInt(rng, 60, 180);

      timesheets.push({
        id: `ts-${date}-${i}-${driver.id}-${routeName.replace(/\s/g, '').toLowerCase()}`,
        driverId: driver.id,
        driverName: driver.name,
        date,
        shiftStart: start,
        shiftEnd: end,
        durationMinutes,
        routeName,
        percentRouteCompleted,
      });
    }
  }

  // Next 6 weeks schedule (42 days): drivers + managers on duty
  const scheduleDays: ScheduleDay[] = [];
  for (let dayOffset = 0; dayOffset < 42; dayOffset++) {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    const date = isoDate(d);

    const blocks: ScheduleShiftBlock[] = [];

    const managersOnDuty = seededInt(rng, 1, clamp(managers.length, 1, 2));
    for (let i = 0; i < managersOnDuty; i++) {
      const m = managers[seededInt(rng, 0, Math.max(0, managers.length - 1))] ?? {
        id: `manager-${i}`,
        name: 'Manager',
      };
      const start = atLocalTime(d, 8, 0);
      const end = atLocalTime(d, 17, 0);
      blocks.push({ personId: m.id, personName: m.name, role: 'manager', shiftStart: start, shiftEnd: end });
    }

    const driversOnDuty = seededInt(rng, 4, clamp(drivers.length, 4, 8));
    for (let i = 0; i < driversOnDuty; i++) {
      const driver = drivers[seededInt(rng, 0, Math.max(0, drivers.length - 1))] ?? {
        id: `driver-${i}`,
        name: 'Driver',
      };
      const routeName = routeNames[seededInt(rng, 0, routeNames.length - 1)];
      const startHour = seededInt(rng, 7, 19);
      const durationMinutes = seededInt(rng, 60, 180);
      const start = atLocalTime(d, startHour, 0);
      const end = start + durationMinutes * 60000;
      blocks.push({ personId: driver.id, personName: driver.name, role: 'driver', routeName, shiftStart: start, shiftEnd: end });
    }

    scheduleDays.push({ date, blocks });
  }

  if (existingTimesheets.length === 0) setSeededTimesheets(timesheets);
  if (existingSchedule.length === 0) setSeededSchedule(scheduleDays);
}

