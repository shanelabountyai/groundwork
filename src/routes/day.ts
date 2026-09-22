import { prisma } from '../db';
import { toDbDate, type LocalDate } from '../time';
import { drivenOrder } from './route';
import { estimateDrive } from './routing';

/**
 * One crew's route for one day. "The algorithm suggests, the human decides":
 * an untouched day is ordered nearest-neighbor on every read, so visits that
 * arrive later slot in. Once a dispatcher drags, that order is persisted and
 * auto-order never runs on the day again until `autoOrderRoute` is called.
 */
export async function routeFor(crewId: string, date: LocalDate) {
  const crew = await prisma.crew.findUniqueOrThrow({ where: { id: crewId } });
  const visits = await prisma.visit.findMany({
    where: { crewId, date: toDbDate(date) },
    orderBy: [{ routePosition: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
    include: { property: true, serviceType: true },
  });
  const stops = visits.map((v) => ({ visit: v, lat: v.property.lat, lng: v.property.lng, routePosition: v.routePosition }));
  const home = { lat: crew.homeLat, lng: crew.homeLng };

  // Positions exist only on a day a person ordered. Visits moved in since sort last.
  const { manual, ordered } = drivenOrder(home, stops);
  return { manual, stops: ordered.map((s) => s.visit), estimate: await estimateDrive(home, ordered) };
}

/** Persist the dispatcher's drag order. Must name every visit on the day, once. */
export async function reorderRoute(crewId: string, date: LocalDate, visitIds: string[]) {
  await prisma.$transaction(async (tx) => {
    const onDay = await tx.visit.findMany({ where: { crewId, date: toDbDate(date) }, select: { id: true } });
    const given = new Set(visitIds);
    if (given.size !== visitIds.length || given.size !== onDay.length || !onDay.every((v) => given.has(v.id))) {
      throw new Error('Reorder must list every visit on the day exactly once');
    }
    for (const [i, id] of visitIds.entries()) {
      await tx.visit.update({ where: { id }, data: { routePosition: i } });
    }
  });
}

/** The explicit re-request: hand the day back to nearest-neighbor. */
export async function autoOrderRoute(crewId: string, date: LocalDate) {
  await prisma.visit.updateMany({ where: { crewId, date: toDbDate(date) }, data: { routePosition: null } });
}
