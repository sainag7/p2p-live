import type { Vehicle, Route } from '../types';

export function isExpressRoute(input: { routeName?: string; routeId?: string } | Vehicle | Route): boolean {
  const name = (input as { routeName?: string; name?: string }).routeName ?? (input as Route).name ?? '';
  return /express/i.test(name);
}

export function isBaityRoute(input: { routeName?: string } | Vehicle | Route): boolean {
  const name = (input as { routeName?: string; name?: string }).routeName ?? (input as Route).name ?? '';
  return /baity/i.test(name);
}
