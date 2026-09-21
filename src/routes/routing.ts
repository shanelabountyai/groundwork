/**
 * Real drive miles/minutes, behind the same { miles, driveMinutes } shape as
 * `estimate()`. Stop order is fixed input — this asks OSRM for the cost of
 * the route already decided (nearestNeighbor or the dispatcher's drag order),
 * never to re-order it. "Algorithm suggests, human decides" applies to order;
 * this only makes the number attached to that order honest.
 *
 * Falls back to the straight-line estimate on anything that isn't a clean
 * success — no OSRM_BASE_URL configured, network error, timeout, non-2xx,
 * empty route — same shape as notifications/provider.ts's console fallback:
 * unset in local dev and e2e, so nothing here needs a network to pass.
 */
import { estimate, type Point } from './route';

const METERS_PER_MILE = 1609.34;
const TIMEOUT_MS = 3000;

export async function estimateDrive(
  home: Point,
  stops: readonly Point[],
  opts?: { roadFactor: number; mph: number },
): Promise<{ miles: number; driveMinutes: number }> {
  const baseUrl = process.env.OSRM_BASE_URL;
  if (!baseUrl || stops.length === 0) return estimate(home, stops, opts);

  try {
    const coords = [home, ...stops, home].map((p) => `${p.lng},${p.lat}`).join(';');
    const res = await fetch(`${baseUrl}/route/v1/driving/${coords}?overview=false`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const route = (await res.json())?.routes?.[0];
    if (!route) throw new Error('OSRM: no route');
    return {
      miles: Math.round((route.distance / METERS_PER_MILE) * 10) / 10,
      driveMinutes: Math.round(route.duration / 60),
    };
  } catch {
    return estimate(home, stops, opts);
  }
}
