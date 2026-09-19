/**
 * Route ordering for one crew-day. Pure: no database, no clock.
 *
 * Nearest-neighbor from the crew's home base, by great-circle distance. It is
 * a heuristic, not an optimizer — the dispatcher's drag order always wins.
 * A route is a round trip: home → stops → home.
 */
export interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_MILES = 3958.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMiles(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

/** Straight-line length of home → stops in order → home. */
export function routeMiles(home: Point, stops: readonly Point[]): number {
  if (stops.length === 0) return 0;
  let total = 0;
  let at = home;
  for (const s of stops) {
    total += haversineMiles(at, s);
    at = s;
  }
  return total + haversineMiles(at, home);
}

// ponytail: O(n²) greedy; fine for a crew-day of ~15 stops. 2-opt pass is P2.
export function nearestNeighbor<T extends Point>(home: Point, stops: readonly T[]): T[] {
  const left = [...stops];
  const out: T[] = [];
  let at: Point = home;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (haversineMiles(at, left[i]!) < haversineMiles(at, left[best]!)) best = i;
    }
    at = left[best]!;
    out.push(left.splice(best, 1)[0]!);
  }
  return out;
}

/**
 * An ESTIMATE, not drive time: straight-line miles × a road factor, at an
 * assumed average speed. There is no routing API in v1; label it as such.
 */
export const ROAD_FACTOR = Number(process.env.GROUNDWORK_ROAD_FACTOR ?? 1.3);
export const AVG_MPH = 25;

export function estimate(home: Point, stops: readonly Point[], opts = { roadFactor: ROAD_FACTOR, mph: AVG_MPH }) {
  const miles = routeMiles(home, stops) * opts.roadFactor;
  return { miles: Math.round(miles * 10) / 10, driveMinutes: Math.round((miles / opts.mph) * 60) };
}
