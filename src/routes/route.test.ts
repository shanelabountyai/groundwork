import { describe, expect, it } from 'vitest';
import { drivenOrder, estimate, haversineMiles, nearestNeighbor, routeMiles, twoOpt, type Point } from './route';

const home: Point = { lat: 36.154, lng: -95.993 }; // downtown Tulsa

// Eight Tulsa-area stops per set, listed in "creation order" — the order a
// dispatcher typed them in, which zigzags across town.
const fixtures: Record<string, Point[]> = {
  zigzag: [
    { lat: 36.06, lng: -95.85 }, { lat: 36.2, lng: -96.02 }, { lat: 36.07, lng: -95.95 }, { lat: 36.21, lng: -95.9 },
    { lat: 36.05, lng: -96.0 }, { lat: 36.16, lng: -95.82 }, { lat: 36.11, lng: -96.05 }, { lat: 36.02, lng: -95.9 },
  ],
  southSprawl: [
    { lat: 35.97, lng: -95.88 }, { lat: 36.12, lng: -95.9 }, { lat: 35.99, lng: -96.02 }, { lat: 36.1, lng: -95.97 },
    { lat: 35.95, lng: -95.94 }, { lat: 36.05, lng: -95.86 }, { lat: 36.0, lng: -95.96 }, { lat: 36.08, lng: -96.01 },
  ],
  alreadyTidy: [
    { lat: 36.15, lng: -95.97 }, { lat: 36.14, lng: -95.95 }, { lat: 36.13, lng: -95.93 }, { lat: 36.12, lng: -95.91 },
    { lat: 36.11, lng: -95.89 }, { lat: 36.1, lng: -95.87 }, { lat: 36.09, lng: -95.85 }, { lat: 36.08, lng: -95.83 },
  ],
};

describe('haversineMiles', () => {
  it('Tulsa downtown to Broken Arrow is about 14 miles', () => {
    expect(haversineMiles(home, { lat: 36.0526, lng: -95.7908 })).toBeCloseTo(13.7, 0);
  });

  it('is zero to itself and symmetric', () => {
    const p = fixtures.zigzag![0]!;
    expect(haversineMiles(p, p)).toBe(0);
    expect(haversineMiles(home, p)).toBe(haversineMiles(p, home));
  });
});

describe('nearestNeighbor', () => {
  it.each(Object.entries(fixtures))('%s: auto-order is no longer than creation order', (_, stops) => {
    const ordered = nearestNeighbor(home, stops);
    expect(ordered).toHaveLength(8);
    expect(new Set(ordered)).toEqual(new Set(stops));
    expect(routeMiles(home, ordered)).toBeLessThanOrEqual(routeMiles(home, stops));
  });

  it('strictly beats a zigzag', () => {
    const stops = fixtures.zigzag!;
    expect(routeMiles(home, nearestNeighbor(home, stops))).toBeLessThan(routeMiles(home, stops) * 0.8);
  });

  it('starts at the stop nearest home', () => {
    const near = { lat: 36.155, lng: -95.99 };
    expect(nearestNeighbor(home, [{ lat: 36.0, lng: -95.8 }, near])[0]).toBe(near);
  });

  it('handles an empty day', () => {
    expect(nearestNeighbor(home, [])).toEqual([]);
    expect(routeMiles(home, [])).toBe(0);
  });

  // P1-4: two agreements on one property are two stops at identical
  // coordinates. Once either is visited, the other is a zero-distance
  // match, so it always wins the next pick — adjacency falls out of the
  // existing tie-break rather than needing a property-grouping pass.
  it('seats two visits at the same property adjacently, wherever they fall in input order', () => {
    const propA = { id: 'mow', lat: 36.09, lng: -95.94 };
    const propB = { id: 'fertilize', lat: 36.09, lng: -95.94 }; // same property, second agreement
    const scattered = [
      { id: 'far-1', lat: 36.06, lng: -95.85 },
      propA,
      { id: 'far-2', lat: 36.2, lng: -96.02 },
      { id: 'far-3', lat: 36.02, lng: -95.9 },
      propB,
      { id: 'far-4', lat: 36.16, lng: -95.82 },
    ];
    const ordered = nearestNeighbor(home, scattered);
    const ids = ordered.map((s) => s.id);
    expect(Math.abs(ids.indexOf('mow') - ids.indexOf('fertilize'))).toBe(1);
  });
});

describe('twoOpt', () => {
  it.each(Object.entries(fixtures))('%s: never makes nearest-neighbor worse', (_, stops) => {
    const nn = nearestNeighbor(home, stops);
    const refined = twoOpt(home, nn);
    expect(new Set(refined)).toEqual(new Set(stops));
    expect(routeMiles(home, refined)).toBeLessThanOrEqual(routeMiles(home, nn) + 1e-9);
  });

  it('leaves fewer than 4 stops untouched', () => {
    const stops = fixtures.zigzag!.slice(0, 3);
    expect(twoOpt(home, stops)).toEqual(stops);
  });

  it('unwinds a crossed-over pair nearest-neighbor cannot see coming', () => {
    // A loop where the greedy pick at each step still leaves one crossing;
    // 2-opt is the only one of the two that can uncross it.
    const stops = [
      { lat: 36.2, lng: -95.8 },
      { lat: 36.0, lng: -96.0 },
      { lat: 36.2, lng: -96.0 },
      { lat: 36.0, lng: -95.8 },
    ];
    const refined = twoOpt(home, nearestNeighbor(home, stops));
    expect(routeMiles(home, refined)).toBeLessThanOrEqual(routeMiles(home, stops));
  });
});

describe('drivenOrder', () => {
  it('runs auto stops through twoOpt on top of nearest-neighbor', () => {
    const stops = fixtures.zigzag!.map((p, i) => ({ ...p, id: `s${i}`, routePosition: null as number | null }));
    const { manual, ordered } = drivenOrder(home, stops);
    expect(manual).toBe(false);
    expect(routeMiles(home, ordered)).toBeLessThanOrEqual(routeMiles(home, nearestNeighbor(home, stops)) + 1e-9);
  });

  it('leaves a manual order untouched', () => {
    const stops = fixtures.zigzag!.map((p, i) => ({ ...p, id: `s${i}`, routePosition: i }));
    const { manual, ordered } = drivenOrder(home, stops);
    expect(manual).toBe(true);
    expect(ordered).toEqual(stops);
  });
});

describe('estimate', () => {
  it('is straight-line miles × road factor, round trip from home', () => {
    const stop = { lat: 36.0526, lng: -95.7908 };
    const straight = 2 * haversineMiles(home, stop);
    expect(estimate(home, [stop], { roadFactor: 1.5, mph: 30 })).toEqual({
      miles: Math.round(straight * 1.5 * 10) / 10,
      driveMinutes: Math.round(((straight * 1.5) / 30) * 60),
    });
  });
});
