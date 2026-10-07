import type { ClientLiveStatus } from '../types';
import { ROUTE_IDS } from '../data/routes';
import { getServiceResumeLabel, isRouteOperatingNow } from './serviceSchedule';

export interface LiveStatusMessage {
  text: string;
  tone: 'info' | 'warning';
}

export function getLiveStatusMessage(status: ClientLiveStatus, now: Date = new Date()): LiveStatusMessage | null {
  switch (status) {
    case 'live':
    case 'loading':
      return null;
    case 'degraded':
      return { text: 'Live data delayed — bus positions may be a little behind.', tone: 'warning' };
    case 'unavailable':
      return { text: 'Live data unavailable — showing scheduled times.', tone: 'warning' };
    case 'no-service':
      return ROUTE_IDS.some((routeId) => isRouteOperatingNow(routeId, now))
        ? { text: 'No buses are reporting right now — showing scheduled times.', tone: 'info' }
        : { text: `No buses running — service starts ${getServiceResumeLabel()}.`, tone: 'info' };
    default:
      return null;
  }
}
