import { describe, it, expect } from 'vitest';
import { createRouteInterpolator } from '../../utils/routeInterpolation';
import { COAST_SEC, EXTRAPOLATE_SEC, FOLLOW_RATE, HOLD_METERS, reportAgeSec, stepBus, travelledSince, type BusMotion } from '../../utils/liveVehicleAnimation';
import { makeVehicle } from '../fixtures/transit';

// A closed loop about 1.8 km around, so wrap-around can be tested.
const loop = createRouteInterpolator([[-79.05, 35.9], [-79.045, 35.9], [-79.045, 35.905], [-79.05, 35.905], [-79.05, 35.9]])!;
const FRAME = 1 / 60;

/** Run `seconds` of frames against a fixed report `age` seconds old at the start. */
function run(prev: BusMotion | null, v: ReturnType<typeof makeVehicle>, age: number, seconds: number) {
  let m = prev, dists: number[] = [];
  for (let t = 0; t < seconds; t += FRAME) { m = stepBus(m, v, loop, age + t, FRAME); dists.push(m.dist!); }
  return { motion: m!, dists };
}

describe('travelledSince', () => {
  it('keeps the reported speed, then eases to a stop', () => {
    expect(travelledSince(10, 3)).toBe(30);
    expect(travelledSince(10, EXTRAPOLATE_SEC)).toBe(10 * EXTRAPOLATE_SEC);
    const stopped = travelledSince(10, EXTRAPOLATE_SEC + COAST_SEC);
    expect(travelledSince(10, 999)).toBe(stopped);
    expect(stopped).toBe(10 * (EXTRAPOLATE_SEC + COAST_SEC / 2));
  });
});

describe('reportAgeSec', () => {
  const v = makeVehicle({ lastUpdated: '2026-09-14T23:00:00.000Z' });
  const reported = Date.parse('2026-09-14T23:00:00.000Z');
  it('times the bus from its own GPS report, corrected for the clock offset', () => {
    expect(reportAgeSec(v, reported + 5000, 0, null)).toBe(5);
    // Client clock 30 s ahead of the server.
    expect(reportAgeSec(v, reported + 35000, 30000, null)).toBe(5);
  });
  it('falls back to when the snapshot arrived', () => {
    expect(reportAgeSec(v, 10000, null, 7000)).toBe(3);
    expect(reportAgeSec({ ...v, lastUpdated: null }, 10000, 0, 7000)).toBe(3);
  });
});

describe('stepBus', () => {
  it('starts a new bus on its line, as if already following at its speed', () => {
    const m = stepBus(null, makeVehicle({ distAlong: 500, speedMps: 6 }), loop, 0, FRAME);
    expect(m.dist).toBeCloseTo(500 - 2 * 6 / FOLLOW_RATE, 6);
    expect(m.speed).toBe(6);
    expect([m.lon, m.lat]).toEqual(loop.pointAt(m.dist!));
  });

  it('moves a little every frame at a steady pace, never jumping', () => {
    const v = makeVehicle({ distAlong: 100, speedMps: 8 });
    const { dists } = run(null, v, 0, 6);
    const steps = dists.slice(1).map((d, i) => d - dists[i]);
    for (const step of steps) {
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThan(8 * FRAME * 1.05);
    }
  });

  it('keeps up with the bus when the page only gets a frame a second', () => {
    const v = makeVehicle({ distAlong: 100, speedMps: 12 });
    let m = stepBus(null, v, loop, 0, FRAME);
    for (let t = 1; t <= EXTRAPOLATE_SEC; t++) m = stepBus(m, v, loop, t, 1);
    // Steady-state spring lag only (2 × speed / rate), not the bus crawling at a fraction of its speed.
    expect(Math.abs(100 + 12 * EXTRAPOLATE_SEC - m.dist! - 2 * 12 / FOLLOW_RATE)).toBeLessThan(2);
  });

  it('glides into a new report instead of jumping to it', () => {
    const first = run(null, makeVehicle({ distAlong: 100, speedMps: 8 }), 0, 8).motion;
    // The next report puts the bus 20 m farther along than predicted.
    const next = makeVehicle({ distAlong: 100 + 8 * 8 + 20, speedMps: 8 });
    const { dists } = run(first, next, 0, 3);
    expect(dists[0] - first.dist!).toBeLessThan(0.5);
    expect(Math.max(...dists.slice(1).map((d, i) => d - dists[i]))).toBeLessThan(0.5);
  });

  it('waits rather than rolling backward when slightly ahead of the feed', () => {
    const ahead: BusMotion = { ...stepBus(null, makeVehicle({ distAlong: 300, speedMps: 0 }), loop, 0, FRAME), dist: 300 + HOLD_METERS / 2, speed: 0 };
    const { dists } = run(ahead, makeVehicle({ distAlong: 300, speedMps: 0 }), 0, 2);
    expect(Math.min(...dists)).toBeCloseTo(300 + HOLD_METERS / 2, 6);
  });

  it('comes to rest where a stopped bus is', () => {
    const { motion } = run(null, makeVehicle({ distAlong: 300, speedMps: 0 }), 0, 1);
    expect(motion.dist).toBeCloseTo(300, 3);
  });

  it('follows the loop past its end without spinning back around', () => {
    const length = loop.totalLengthMeters;
    const near: BusMotion = { ...stepBus(null, makeVehicle({ distAlong: length - 5, speedMps: 8 }), loop, 0, FRAME) };
    const { dists } = run(near, makeVehicle({ distAlong: 10, speedMps: 8 }), 0, 1);
    for (const d of dists) expect(d < 40 || d > length - 40).toBe(true);
  });

  it('jumps when the feed moves the bus far away', () => {
    const prev = stepBus(null, makeVehicle({ distAlong: 100, speedMps: 0 }), loop, 0, FRAME);
    const m = stepBus(prev, makeVehicle({ distAlong: 900, speedMps: 0 }), loop, 0, FRAME);
    expect(m.dist).toBeCloseTo(900, 6);
  });

  it('eases turns instead of snapping to the new heading', () => {
    const v = makeVehicle({ distAlong: null, heading: 90 });
    const prev = stepBus(null, { ...v, heading: 0 }, loop, 0, FRAME);
    const m = stepBus(prev, v, loop, 0, FRAME);
    expect(m.bearing).toBeGreaterThan(0);
    expect(m.bearing).toBeLessThan(10);
    // The short way round: from 350° to 10° turns through 0°, not back through 180°.
    const wrap = stepBus({ ...prev, bearing: 350 }, { ...v, heading: 10 }, loop, 0, FRAME);
    expect(wrap.bearing > 350 || wrap.bearing < 10).toBe(true);
  });

  it('glides to the raw reported position for stale buses or without a line', () => {
    const v = makeVehicle({ lat: 35.95, lon: -79.01, heading: 45 });
    expect(stepBus(null, { ...v, stale: true }, loop, 3, FRAME)).toMatchObject({ lat: 35.95, lon: -79.01, bearing: 45, dist: null });
    const prev = stepBus(null, { ...v, lat: 35.94 }, null, 0, FRAME);
    const m = stepBus(prev, v, null, 0, FRAME);
    expect(m.lat).toBeGreaterThan(35.94);
    expect(m.lat).toBeLessThan(35.95);
  });
});
