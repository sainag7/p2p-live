import type { ServiceMessage } from '../types';

/** System-wide and route messages for the rider banner, minus ones the rider dismissed. */
export function getBannerMessages(messages: ServiceMessage[], dismissedIds: ReadonlySet<string>): ServiceMessage[] {
  return messages.filter((m) => (m.global || m.routeIds.length > 0) && !dismissedIds.has(m.id));
}

/** Messages assigned to a specific stop (shown in its pop-up). */
export function getStopMessages(messages: ServiceMessage[], stopId: string): ServiceMessage[] {
  return messages.filter((m) => m.stopIds.includes(stopId));
}
