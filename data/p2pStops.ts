/**
 * P2P stop locations and route order. Coordinates stored as lat, lon (Mapbox uses [lng, lat] when rendering).
 */

import type { Stop } from '../types';

export const ROUTE_IDS = ['P2P_EXPRESS', 'BAITY_HILL'] as const;
export type RouteId = (typeof ROUTE_IDS)[number];

export interface P2PStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  routeId: RouteId;
  order: number;
}

/** P2P Express stops in exact route order (0..21). Input was "lat, lon"; stored as lat, lon. */
export const P2P_EXPRESS_STOPS: P2PStop[] = [
  { id: 'p2p-express-0', name: 'Hinton James/Horton (Horton Residence Hall)', lat: 35.90337385793685, lon: -79.04388006852989, routeId: 'P2P_EXPRESS', order: 0 },
  { id: 'p2p-express-1', name: 'Manning Lot', lat: 35.90058343157496, lon: -79.04064160413033, routeId: 'P2P_EXPRESS', order: 1 },
  { id: 'p2p-express-2', name: 'Smith Center Stadium (Williamson Lot)', lat: 35.90042259311716, lon: -79.04315773390898, routeId: 'P2P_EXPRESS', order: 2 },
  { id: 'p2p-express-3', name: 'Bowles Drive Tennis Courts (Rams 4)', lat: 35.90127751768585, lon: -79.0439189435939, routeId: 'P2P_EXPRESS', order: 3 },
  { id: 'p2p-express-4', name: 'Rams 1', lat: 35.9019162951523, lon: -79.04550493143637, routeId: 'P2P_EXPRESS', order: 4 },
  { id: 'p2p-express-5', name: 'Craige Parking Deck (Craige Deck)', lat: 35.90347443786602, lon: -79.0466329071957, routeId: 'P2P_EXPRESS', order: 5 },
  { id: 'p2p-express-6', name: 'Ehringhaus Hall', lat: 35.904115113436944, lon: -79.04417811808729, routeId: 'P2P_EXPRESS', order: 6 },
  { id: 'p2p-express-7', name: 'Parker', lat: 35.90693440488656, lon: -79.04453621173634, routeId: 'P2P_EXPRESS', order: 7 },
  { id: 'p2p-express-8', name: 'Carmicheal', lat: 35.908309477975244, lon: -79.04698250497053, routeId: 'P2P_EXPRESS', order: 8 },
  { id: 'p2p-express-9', name: 'Fetzer Gym (SRC/Union)', lat: 35.90966754902179, lon: -79.04750477299666, routeId: 'P2P_EXPRESS', order: 9 },
  { id: 'p2p-express-10', name: 'Connor Hall (Connor)', lat: 35.911035513912395, lon: -79.04670012884985, routeId: 'P2P_EXPRESS', order: 10 },
  { id: 'p2p-express-11', name: 'Lewis Hall (Lewis)', lat: 35.91248882838895, lon: -79.04738933929644, routeId: 'P2P_EXPRESS', order: 11 },
  { id: 'p2p-express-12', name: 'Alderman Hall (Alderman)', lat: 35.91478618478631, lon: -79.0486875062208, routeId: 'P2P_EXPRESS', order: 12 },
  { id: 'p2p-express-13', name: 'Planetarium', lat: 35.91520288295803, lon: -79.05064317485207, routeId: 'P2P_EXPRESS', order: 13 },
  { id: 'p2p-express-14', name: 'East Franklin Street at Henderson Street (Henderson)', lat: 35.9143991363535, lon: -79.05277868265114, routeId: 'P2P_EXPRESS', order: 14 },
  { id: 'p2p-express-16', name: 'Granville Towers', lat: 35.91166084749081, lon: -79.05624829745744, routeId: 'P2P_EXPRESS', order: 16 },
  { id: 'p2p-express-15', name: 'Varsity Theatre (Varsity Theatre)', lat: 35.913585857732784, lon: -79.05492677418108, routeId: 'P2P_EXPRESS', order: 15 },
  { id: 'p2p-express-17', name: 'Newman Center (Newman Center)', lat: 35.90891020128056, lon: -79.05481703842177, routeId: 'P2P_EXPRESS', order: 17 },
  { id: 'p2p-express-18', name: 'FedEx Center (McCauley)', lat: 35.908277423793606, lon: -79.05425436054487, routeId: 'P2P_EXPRESS', order: 18 },
  { id: 'p2p-express-19', name: 'Bell Tower', lat: 35.90900124698134, lon: -79.04906471285007, routeId: 'P2P_EXPRESS', order: 19 },
  { id: 'p2p-express-20', name: 'Kenan Stadium', lat: 35.908145079380006, lon: -79.0469851400408, routeId: 'P2P_EXPRESS', order: 20 },
  { id: 'p2p-express-21', name: 'Avery Hall (Avery)', lat: 35.9065077555351, lon: -79.04450189656242, routeId: 'P2P_EXPRESS', order: 21 },
];

/** Baity Hill stops in exact route order (0..14). Input was "lat, lon"; stored as lat, lon. */
export const BAITY_HILL_STOPS: P2PStop[] = [
  { id: 'baity-hill-0', name: 'Hinton James/Horton (Horton Residence Hall)', lat: 35.90337385793685, lon: -79.04388006852989, routeId: 'BAITY_HILL', order: 0 },
  { id: 'baity-hill-1', name: 'Baity Hill Community', lat: 35.89781800775476, lon: -79.04245671449672, routeId: 'BAITY_HILL', order: 1 },
  { id: 'baity-hill-2', name: '1501 Mason Farm', lat: 35.89769188168773, lon: -79.04370377508533, routeId: 'BAITY_HILL', order: 2 },
  { id: 'baity-hill-3', name: 'Mason Farm Road at Oteys Road (1351, 1401 Mason Farm)', lat: 35.89783775308973, lon: -79.04582410216587, routeId: 'BAITY_HILL', order: 3 },
  { id: 'baity-hill-4', name: '1101 Mason Farm', lat: 35.899128143286454, lon: -79.05013453702671, routeId: 'BAITY_HILL', order: 4 },
  { id: 'baity-hill-5', name: 'Ambulatory Care Center (Marsico Hall)', lat: 35.902278598505646, lon: -79.05476679712706, routeId: 'BAITY_HILL', order: 5 },
  { id: 'baity-hill-6', name: 'Health Sciences Library (Health Sciences)', lat: 35.90551390978456, lon: -79.05328358345422, routeId: 'BAITY_HILL', order: 6 },
  { id: 'baity-hill-7', name: 'Sitterson Hall', lat: 35.90928737000317, lon: -79.05322024744142, routeId: 'BAITY_HILL', order: 7 },
  { id: 'baity-hill-8', name: 'Granville Towers East', lat: 35.911079629672166, lon: -79.05623781887527, routeId: 'BAITY_HILL', order: 8 },
  { id: 'baity-hill-9', name: 'Carolina Coffee Shop (Carolina Coffee Shop)', lat: 35.913674998698625, lon: -79.05413567269116, routeId: 'BAITY_HILL', order: 9 },
  { id: 'baity-hill-10', name: 'Spencer Hall (Spencer Hall)', lat: 35.91468514059627, lon: -79.04875815027137, routeId: 'BAITY_HILL', order: 10 },
  { id: 'baity-hill-11', name: 'UNC Student Union (Student Union)', lat: 35.90975049380575, lon: -79.0478389489533, routeId: 'BAITY_HILL', order: 11 },
  { id: 'baity-hill-12', name: 'Credit Union', lat: 35.90689040606373, lon: -79.05487993043617, routeId: 'BAITY_HILL', order: 12 },
  { id: 'baity-hill-13', name: 'Mason Farm Rd at Ambulatory Care Center (Ambulatory Care Center)', lat: 35.902108974392156, lon: -79.05432069560172, routeId: 'BAITY_HILL', order: 13 },
  { id: 'baity-hill-14', name: 'Craige Parking Deck (Craige Deck)', lat: 35.90347443786602, lon: -79.0466329071957, routeId: 'BAITY_HILL', order: 14 },
];

/** All stops as Stop[] for app/journey/geo (id, name, lat, lon only). */
export const STOPS: Stop[] = [
  ...P2P_EXPRESS_STOPS.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon })),
  ...BAITY_HILL_STOPS.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon })),
];
