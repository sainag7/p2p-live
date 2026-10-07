import { describe, expect, it } from 'vitest';
import { createRequestQueue } from '../../utils/requestQueue';

describe('request concurrency', () => {
  it('caps overlapping callers and starts queued work when a slot opens', async () => {
    const run = createRequestQueue(2);
    const releases: (() => void)[] = [];
    let running = 0, peak = 0;
    const results = Array.from({ length: 5 }, (_, i) => run(async () => {
      peak = Math.max(peak, ++running);
      await new Promise<void>(resolve => releases.push(resolve));
      running--;
      return i;
    }));
    await Promise.resolve();
    expect(running).toBe(2);
    for (let i = 0; i < 5; i++) {
      releases.shift()!();
      // Drain promise callbacks before checking the next queue slot.
      for (let j = 0; j < 8; j++) await Promise.resolve();
    }
    expect(await Promise.all(results)).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it('releases a slot after a synchronous exception or rejected request', async () => {
    const run = createRequestQueue(1);
    const first = run(() => { throw new Error('offline'); });
    const second = run(() => Promise.reject(new Error('timeout')));
    const third = run(async () => 'recovered');
    await expect(first).rejects.toThrow('offline');
    await expect(second).rejects.toThrow('timeout');
    await expect(third).resolves.toBe('recovered');
  });
});
