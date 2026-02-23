import { Route, Vehicle, Destination } from '../types';
import { STOPS } from './p2pStops';

export { STOPS };
export const ROUTES: Route[] = [
  { id: 'p2p-express', name: 'P2P Express', color: '#418FC5' },
  { id: 'baity-hill', name: 'Baity Hill', color: '#C33934' },
];

export const VEHICLES: Vehicle[] = [
  {
    id: 'bus-101',
    routeId: 'p2p-express',
    routeName: 'P2P Express',
    lat: 35.9110,
    lon: -79.0485,
    heading: 90,
    nextStopId: 'p2p-express-9',
    nextStopEtaMin: 2,
    upcomingStops: [
      { stopId: 'p2p-express-9', etaMin: 2 },
      { stopId: 'p2p-express-10', etaMin: 5 },
      { stopId: 'p2p-express-15', etaMin: 12 },
    ]
  },
  {
    id: 'bus-201',
    routeId: 'baity-hill',
    routeName: 'Baity Hill',
    lat: 35.9010,
    lon: -79.0420,
    heading: 180,
    nextStopId: 'baity-hill-1',
    nextStopEtaMin: 1,
    upcomingStops: [
      { stopId: 'baity-hill-1', etaMin: 1 },
      { stopId: 'baity-hill-2', etaMin: 4 },
      { stopId: 'baity-hill-5', etaMin: 9 },
    ]
  },
  {
    id: 'bus-102',
    routeId: 'p2p-express',
    routeName: 'P2P Express',
    lat: 35.9040,
    lon: -79.0460,
    heading: 0,
    nextStopId: 'p2p-express-6',
    nextStopEtaMin: 3,
    upcomingStops: [
      { stopId: 'p2p-express-6', etaMin: 3 },
      { stopId: 'p2p-express-20', etaMin: 6 },
      { stopId: 'p2p-express-9', etaMin: 10 },
    ]
  },
  {
    id: 'bus-202',
    routeId: 'baity-hill',
    routeName: 'Baity Hill',
    lat: 35.9010,
    lon: -79.0420,
    heading: 180,
    nextStopId: 'baity-hill-1',
    nextStopEtaMin: 1,
    upcomingStops: [
      { stopId: 'baity-hill-1', etaMin: 4 },
      { stopId: 'baity-hill-2', etaMin: 9 },
      { stopId: 'baity-hill-5', etaMin: 11 },
    ]
  },
];

export const MOCK_DESTINATIONS: Destination[] = [
  { id: 'davis', name: 'Davis Library', lat: 35.9088, lon: -79.0470, address: '208 Raleigh St' },
  { id: 'union', name: 'Student Union', lat: 35.9105, lon: -79.0478, address: '209 South Rd' },
  { id: 'lenoir', name: 'Lenoir Dining Hall', lat: 35.9118, lon: -79.0482, address: '100 Manning Dr' },
  { id: 'rams', name: 'Rams Head Rec Center', lat: 35.9032, lon: -79.0440, address: '340 Ridge Rd' },
  { id: 'dean', name: 'Dean Smith Center', lat: 35.8999, lon: -79.0438, address: '300 Skipper Bowles Dr' },
  { id: 'kenan', name: 'Kenan Stadium', lat: 35.9069, lon: -79.0479, address: '104 Stadium Dr' },
  { id: 'target', name: 'Target Franklin St', lat: 35.9132, lon: -79.0558, address: '143 W Franklin St' },
  { id: 'hospital', name: 'UNC Hospitals', lat: 35.9025, lon: -79.0500, address: '101 Manning Dr' },
  { id: 'store', name: 'Student Stores', lat: 35.9100, lon: -79.0465, address: '207 South Rd' },
  { id: 'granville', name: 'Granville Towers', lat: 35.9135, lon: -79.0590, address: '125 W Franklin St' },
];
