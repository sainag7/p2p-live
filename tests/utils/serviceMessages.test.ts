import { describe, it, expect } from 'vitest';
import type { ServiceMessage } from '../../types';
import { getBannerMessages, getStopMessages } from '../../utils/serviceMessages';

const msg = (o: Partial<ServiceMessage>): ServiceMessage => ({
  id: '1', title: 't', body: '', global: false, routeIds: [], stopIds: [], startsAt: null, endsAt: null, ...o,
});

const globalMsg = msg({ id: 'g', global: true });
const routeMsg = msg({ id: 'r', routeIds: ['P2P_EXPRESS'] });
const stopMsg = msg({ id: 's', stopIds: ['10044065'] });

describe('getBannerMessages', () => {
  it('returns global and route messages, not stop-only ones', () => {
    expect(getBannerMessages([globalMsg, routeMsg, stopMsg], new Set()).map((m) => m.id)).toEqual(['g', 'r']);
  });
  it('hides dismissed messages', () => {
    expect(getBannerMessages([globalMsg, routeMsg], new Set(['g'])).map((m) => m.id)).toEqual(['r']);
  });
});

describe('getStopMessages', () => {
  it('returns messages assigned to the stop', () => {
    expect(getStopMessages([globalMsg, routeMsg, stopMsg], '10044065').map((m) => m.id)).toEqual(['s']);
    expect(getStopMessages([stopMsg], 'other')).toEqual([]);
  });
});
