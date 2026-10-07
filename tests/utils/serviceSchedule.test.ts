import { describe, it, expect } from 'vitest';
import { getUpcomingRouteArrivals, isRouteOperatingNow } from '../../utils/serviceSchedule';

describe('serviceSchedule', () => {
  it('operates at 9 PM on a Monday', () => {
    expect(isRouteOperatingNow('P2P_EXPRESS', new Date(2026, 8, 14, 21, 0))).toBe(true);
  });

  it('does not operate at noon', () => {
    expect(isRouteOperatingNow('P2P_EXPRESS', new Date(2026, 8, 14, 12, 0))).toBe(false);
  });

  it('returns near-term ETAs after midnight', () => {
    const etas = getUpcomingRouteArrivals('P2P_EXPRESS', new Date(2026, 8, 15, 0, 30), 2);
    expect(etas).toHaveLength(2);
    expect(etas[0]).toBeLessThanOrEqual(20);
  });
});
