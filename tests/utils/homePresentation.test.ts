import { describe, expect, it } from 'vitest';
import { homeBoardingStop, homeDeparture, homeEta, homeServiceSummary, homeUrgency, nearestHomeStop, serviceCountdown } from '../../utils/homePresentation';
import type { Stop, StopArrival } from '../../types';

const afternoon = new Date(2026, 8, 20, 14);
const evening = new Date(2026, 8, 20, 20);
describe('Home service summary', () => {
  it('distinguishes tracking failure from inactive service even outside scheduled hours', () => {
    expect(homeServiceSummary('unavailable', afternoon)).toMatchObject({ label: 'Live tracking unavailable', tone: 'warning' });
    expect(homeServiceSummary('degraded', afternoon)).toMatchObject({ label: 'Live tracking delayed', tone: 'warning' });
    expect(homeServiceSummary('loading', afternoon).tone).toBe('neutral');
    expect(homeServiceSummary('live', afternoon)).toMatchObject({ label: 'Service running', tone: 'active' });
  });
  it('only shows the service start for no-service outside scheduled hours', () => {
    expect(homeServiceSummary('no-service', afternoon)).toMatchObject({label:'Service starts at 7:00 PM',tone:'inactive',value:'7:00 PM'});
    expect(homeServiceSummary('no-service', evening).label).toBe('No buses reporting');
    expect(homeServiceSummary('no-service', new Date(2026,8,21,1)).label).toBe('No buses reporting');
  });
});
describe('Home departures', () => {
  const make = (etaSec:number, routeId:StopArrival['routeId']='P2P_EXPRESS'):StopArrival => ({etaSec,routeId,routeName:'P2P Express',source:'live',vehicleId:null});
  it('says when to leave: bus ETA minus the walk', () => {
    expect(homeDeparture([make(480)], 180)).toMatchObject({busInMin:8,walkMin:3,leaveInMin:5});
    // The walk rounds up, so the shown numbers always add up.
    expect(homeDeparture([make(530)], 130)).toMatchObject({busInMin:8,walkMin:3,leaveInMin:5});
  });
  it('skips a bus that arrives before the rider can walk there', () => {
    const arrivals=[make(420,'BAITY_HILL'),make(90),make(900)];
    expect(homeDeparture(arrivals, 150)?.arrival).toBe(arrivals[0]);
    expect(homeDeparture(arrivals, 60)?.arrival).toBe(arrivals[1]);
    expect(arrivals[0].etaSec).toBe(420);
  });
  it('says go now when the bus is due, including for a rider already at the stop', () => {
    expect(homeDeparture([make(30)], 10)).toMatchObject({busInMin:0,walkMin:1,leaveInMin:0});
    expect(homeDeparture([make(200)], 170)).toMatchObject({busInMin:3,walkMin:3,leaveInMin:0});
  });
  it('falls back to the earliest arrival when none is reachable', () => {
    const arrivals=[make(240),make(120)];
    expect(homeDeparture(arrivals, 600)).toMatchObject({arrival:arrivals[1],leaveInMin:0});
  });
  it('ignores missing or negative ETAs', () => {
    expect(homeDeparture([make(NaN),make(-2)], 60)).toBeNull();
    expect(homeDeparture([], 60)).toBeNull();
  });
  it('does not turn missing or stale ETAs into imminent arrivals', () => {
    expect(homeEta(null).value).toBe('—');
    expect(homeEta(0,true).value).toBe('—');
    expect(homeEta(-1).value).toBe('—');
    expect(homeEta(59)).toEqual({value:'Now',unit:''});
    expect(homeEta(120)).toEqual({value:'2',unit:'min'});
  });
});
describe('Home location eligibility', () => {
  const location={lat:35.9105,lon:-79.0478};
  const stops=[{...location,id:'near',name:'Near'}, {lat:35.915,lon:-79.05,id:'far',name:'Far'}] as Stop[];
  it('finds the closest stop only after successful in-area geolocation', () => {
    expect(nearestHomeStop(location,true,stops)?.id).toBe('near');
    expect(nearestHomeStop(location,false,stops)).toBeNull();
    expect(nearestHomeStop({lat:40.7,lon:-74},true,stops)).toBeNull();
    expect(nearestHomeStop(null,true,stops)).toBeNull();
    expect(nearestHomeStop(location,true,[])).toBeNull();
  });
});

describe('Home motion states', () => {
  it('warms up as leave time approaches', () => {
    expect([6, 5, 4, 2, 1, 0].map(homeUrgency)).toEqual(['calm', 'calm', 'soon', 'soon', 'now', 'now']);
  });
  it('counts down to 7 PM service', () => {
    expect(serviceCountdown(new Date(2026, 8, 20, 16, 46))).toBe('2h 14m');
    expect(serviceCountdown(new Date(2026, 8, 20, 18, 25, 30))).toBe('35 min');
    expect(serviceCountdown(new Date(2026, 8, 20, 4, 0))).toBe('15h 0m');
  });
});
describe('Home boarding stop', () => {
  const location = { lat: 35.9105, lon: -79.0478 };
  // About 0 m, 330 m and 440 m north of the rider, then one beyond the walking limit.
  const stops = [
    { ...location, id: 'baity-only', name: 'Mason Farm' },
    { lat: 35.9135, lon: -79.0478, id: 'express', name: 'Express stop' },
    { lat: 35.9145, lon: -79.0478, id: 'express-2', name: 'Farther Express stop' },
    { lat: 35.9255, lon: -79.0478, id: 'too-far', name: 'Too far' },
  ] as Stop[];
  const bus = (etaSec: number): StopArrival => ({ etaSec, routeId: 'P2P_EXPRESS', routeName: 'P2P Express', source: 'live', vehicleId: null });
  const arrivals = (byStop: Record<string, StopArrival[]>) => (stopId: string) => byStop[stopId] ?? [];

  it('skips a nearer stop with no bus coming for the closest one that has one', () => {
    const boarding = homeBoardingStop(location, true, stops, arrivals({ express: [bus(600)], 'express-2': [bus(300)] }));
    expect(boarding?.stop.id).toBe('express');
    expect(boarding?.walkSec).toBeGreaterThan(200);
    expect(boarding?.arrivals).toEqual([bus(600)]);
  });
  it('keeps the nearest stop when a bus is coming there, even if a farther one is sooner', () => {
    expect(homeBoardingStop(location, true, stops, arrivals({ 'baity-only': [bus(900)], express: [bus(120)] }))?.stop.id).toBe('baity-only');
  });
  it('falls back to the nearest stop when no bus is coming within walking distance', () => {
    expect(homeBoardingStop(location, true, stops, arrivals({ 'too-far': [bus(300)] }))).toMatchObject({ stop: { id: 'baity-only' }, arrivals: [] });
  });
  it('needs an in-area location', () => {
    expect(homeBoardingStop(location, false, stops, arrivals({}))).toBeNull();
    expect(homeBoardingStop({ lat: 40.7, lon: -74 }, true, stops, arrivals({}))).toBeNull();
    expect(homeBoardingStop(location, true, [], arrivals({}))).toBeNull();
  });
});
