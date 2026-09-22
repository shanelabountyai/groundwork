import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { prisma } from '../db';
import { makeAgreement, makeCrew, resetDb } from '../test/harness';
import { generateVisits, rescheduleVisit } from '../visits/generate';
import { autoOrderRoute, reorderRoute, routeFor } from './day';
import { routeMiles } from './route';

const DAY = '2026-03-03';

/** A crew at home base with stops placed along a line, created out of order. */
async function day() {
  const crew = await makeCrew();
  // Creation order 3, 1, 4, 2 — nearest-neighbor from home must produce 1, 2, 3, 4.
  for (const k of [3, 1, 4, 2]) {
    const a = await makeAgreement('one_time', DAY, { crewId: crew.id });
    await prisma.property.update({ where: { id: a.propertyId }, data: { lat: crew.homeLat + k * 0.01, lng: crew.homeLng, address: `stop ${k}` } });
  }
  await generateVisits(fixedClock('2026-03-02T17:00:00Z'));
  return crew;
}
const addresses = async (crewId: string) => (await routeFor(crewId, DAY)).stops.map((v) => v.property.address);

beforeEach(resetDb);

describe('route day', () => {
  it('an untouched day is auto-ordered, shorter than creation order', async () => {
    const crew = await day();
    const r = await routeFor(crew.id, DAY);
    expect(r.manual).toBe(false);
    expect(r.stops.map((v) => v.property.address)).toEqual(['stop 1', 'stop 2', 'stop 3', 'stop 4']);
    expect(r.estimate.miles).toBeGreaterThan(0);
  });

  it('manual reorder wins and persists; auto-order does not run again until re-requested', async () => {
    const crew = await day();
    const auto = (await routeFor(crew.id, DAY)).stops;
    const mine = [auto[3]!, auto[0]!, auto[2]!, auto[1]!].map((v) => v.id);
    await reorderRoute(crew.id, DAY, mine);

    const r = await routeFor(crew.id, DAY);
    expect(r.manual).toBe(true);
    expect(r.stops.map((v) => v.id)).toEqual(mine);

    // A visit moved in later goes to the end; the dispatcher's order is untouched.
    const late = await makeAgreement('one_time', '2026-03-04', { crewId: crew.id });
    await generateVisits(fixedClock('2026-03-02T17:00:00Z'));
    const lateVisit = await prisma.visit.findFirstOrThrow({ where: { agreementId: late.id } });
    await rescheduleVisit(lateVisit.id, DAY);
    expect((await routeFor(crew.id, DAY)).stops.map((v) => v.id)).toEqual([...mine, lateVisit.id]);

    await autoOrderRoute(crew.id, DAY);
    expect((await routeFor(crew.id, DAY)).manual).toBe(false);
  });

  it('a visit moved away does not carry its position into its new day', async () => {
    const crew = await day();
    const ids = (await routeFor(crew.id, DAY)).stops.map((v) => v.id);
    await reorderRoute(crew.id, DAY, ids);
    await rescheduleVisit(ids[0]!, '2026-03-05');
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: ids[0]! } })).routePosition).toBeNull();
  });

  it('reorder must list every visit on the day exactly once', async () => {
    const crew = await day();
    const ids = (await routeFor(crew.id, DAY)).stops.map((v) => v.id);
    await expect(reorderRoute(crew.id, DAY, ids.slice(1))).rejects.toThrow(/every visit/);
    await expect(reorderRoute(crew.id, DAY, [...ids.slice(1), ids[1]!])).rejects.toThrow(/every visit/);
    expect((await routeFor(crew.id, DAY)).manual).toBe(false);
  });

  it('auto order is never longer than creation order', async () => {
    const crew = await day();
    const home = { lat: crew.homeLat, lng: crew.homeLng };
    const pt = (v: { property: { lat: number; lng: number } }) => v.property;
    const created = await prisma.visit.findMany({ where: { crewId: crew.id }, orderBy: { createdAt: 'asc' }, include: { property: true } });
    const auto = (await routeFor(crew.id, DAY)).stops;
    expect(routeMiles(home, auto.map(pt))).toBeLessThan(routeMiles(home, created.map(pt)));
  });
});
