/**
 * Friendlier names for GMV stops, keyed by GMV stop id.
 * Seeded from the previous hand-written stop list (matched within ~40 m). Stops not listed use GMV's name.
 */
export const STOP_DISPLAY_NAMES: Record<string, string> = {
  '10042055': 'Granville Towers East',
  '10042057': 'Spencer Hall',
  '10043024': 'UNC Student Union (Student Union)',
  '10043030': 'UNC Student Union (Student Union)',
  '10043117': 'Mason Farm Rd at Ambulatory Care Center',
  '10043118': 'Craige Parking Deck',
  '10043119': 'Hinton James/Horton Residence Hall',
  '10043122': 'Mason Farm Road at Oteys Road (1351, 1401 Mason Farm)',
  '10043124': 'Ambulatory Care Center (Marsico Hall)',
  '10043125': 'Health Sciences Library',
  '10044065': 'Ehringhaus Hall',
  '10044068': 'Fetzer Gym (SRC/Union)',
  '10044069': 'Connor Hall',
  '10044070': 'Lewis Hall',
  '10044071': 'Alderman Hall',
  '10044073': 'East Franklin Street at Henderson Street',
  '10044074': 'Varsity Theatre',
  '10044077': 'FedEx Center (McCauley)',
  '10044080': 'Avery Hall',
  '10044081': 'Hinton James/Horton Residence Hall',
  '10044083': 'Smith Center Stadium (Williamson Lot)',
  '10044084': 'Bowles Drive Tennis Courts (Rams 4)',
  '10044086': 'Craige Parking Deck',
};

export function displayStopName(stopId: string, gmvName: string): string {
  return STOP_DISPLAY_NAMES[stopId] ?? gmvName.trim();
}

/**
 * GMV lists these physical stops once per route. Each P2P Express id is shown as its
 * Baity Hill twin (2–6 m apart), so riders see one stop served by both routes.
 */
export const MERGED_STOP_IDS: Record<string, string> = {
  '10044086': '10043118', // Craige Parking Deck
  '10044081': '10043119', // Hinton James/Horton Residence Hall
};

export function canonicalStopId(stopId: string): string {
  return MERGED_STOP_IDS[stopId] ?? stopId;
}
