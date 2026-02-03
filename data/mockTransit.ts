import { Route, Stop, Vehicle, Destination } from '../types';

export const ROUTES: Route[] = [
  { id: 'p2p-express', name: 'P2P Express', color: '#418FC5' },
  { id: 'baity-hill', name: 'Baity Hill', color: '#C33934' },
];

export const STOPS: Stop[] = [
  { id: 'student-union', name: 'Student Union', lat: 35.9105, lon: -79.0478 },
  { id: 'kenan-stadium', name: 'Kenan Stadium', lat: 35.9069, lon: -79.0479 },
  { id: 'dean-dome', name: 'Dean Smith Center', lat: 35.8999, lon: -79.0438 },
  { id: 'franklin-st', name: 'Franklin St (Target)', lat: 35.9132, lon: -79.0558 },
  { id: 'baity-hill-apts', name: 'Baity Hill Apts', lat: 35.8970, lon: -79.0400 },
  { id: 'south-campus', name: 'South Campus Dorms', lat: 35.9035, lon: -79.0450 },
  { id: 'davis-lib', name: 'Davis Library', lat: 35.9088, lon: -79.0470 },
  { id: 'morrison', name: 'Morrison Residence Hall', lat: 35.9045, lon: -79.0465 },
];

export const VEHICLES: Vehicle[] = [
  {
    id: 'bus-104',
    routeId: 'p2p-express',
    routeName: 'P2P Express',
    lat: 35.9110,
    lon: -79.0485,
    heading: 90,
    nextStopId: 'student-union',
    nextStopEtaMin: 2,
    upcomingStops: [
      { stopId: 'student-union', etaMin: 2 },
      { stopId: 'davis-lib', etaMin: 5 },
      { stopId: 'franklin-st', etaMin: 12 },
    ]
  },
  {
    id: 'bus-202',
    routeId: 'baity-hill',
    routeName: 'Baity Hill',
    lat: 35.9010,
    lon: -79.0420,
    heading: 180,
    nextStopId: 'dean-dome',
    nextStopEtaMin: 1,
    upcomingStops: [
      { stopId: 'dean-dome', etaMin: 1 },
      { stopId: 'baity-hill-apts', etaMin: 4 },
      { stopId: 'south-campus', etaMin: 9 },
    ]
  },
  {
    id: 'bus-108',
    routeId: 'p2p-express',
    routeName: 'P2P Express',
    lat: 35.9040,
    lon: -79.0460,
    heading: 0,
    nextStopId: 'morrison',
    nextStopEtaMin: 3,
    upcomingStops: [
      { stopId: 'morrison', etaMin: 3 },
      { stopId: 'kenan-stadium', etaMin: 6 },
      { stopId: 'student-union', etaMin: 10 },
    ]
  }
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
