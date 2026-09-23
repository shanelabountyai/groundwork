import { systemClock, type Clock } from '../clock';
import { prisma } from '../db';
import { PHOTO_PREFIX } from '../visits/photos';
import { fromDbDate, localDateOf, toDbDate } from '../time';

/** What the portal shows: the property and its upcoming, still-open visits. */
export async function propertySchedule(propertyId: string, clock: Clock = systemClock) {
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) return null;
  const today = localDateOf(clock.now());
  const visits = await prisma.visit.findMany({
    where: { propertyId, date: { gte: toDbDate(today) }, status: { in: ['pending', 'en_route'] } },
    orderBy: { date: 'asc' },
    include: { serviceType: true },
  });
  const requests = await prisma.rescheduleRequest.findMany({
    where: { visit: { propertyId }, status: { in: ['pending', 'declined'] }, requestedDate: { gte: toDbDate(today) } },
    orderBy: { createdAt: 'asc' },
    include: { visit: { include: { serviceType: true } } },
  });
  return {
    property,
    requests: requests.map((r) => ({
      id: r.id,
      status: r.status as 'pending' | 'declined',
      date: fromDbDate(r.requestedDate),
      was: fromDbDate(r.visit.date),
      service: r.visit.serviceType.name,
      note: r.note,
    })),
    visits: visits.map((v) => ({
      id: v.id,
      date: fromDbDate(v.date),
      status: v.status as 'pending' | 'en_route',
      service: v.serviceType.name,
      priceCents: v.priceCents,
    })),
  };
}

export type PortalVisit = NonNullable<Awaited<ReturnType<typeof propertySchedule>>>['visits'][number];

/** Completed and skipped visits, newest first. */
export async function propertyHistory(propertyId: string) {
  const visits = await prisma.visit.findMany({
    where: { propertyId, status: { in: ['completed', 'skipped'] } },
    orderBy: { date: 'desc' },
    include: { serviceType: true },
  });
  const photoName = (p: string | null) => (p?.startsWith(`${PHOTO_PREFIX}/`) ? p.slice(PHOTO_PREFIX.length + 1) : null);
  return visits.map((v) => ({
    id: v.id,
    date: fromDbDate(v.date),
    status: v.status as 'completed' | 'skipped',
    service: v.serviceType.name,
    // The crew's note is deliberately not carried: it is written for the office, not the customer.
    skipReason: v.skipReason,
    before: photoName(v.beforePhoto),
    after: photoName(v.afterPhoto),
  }));
}

/** True only if `name` is a photo on one of this property's own visits. */
export async function propertyOwnsPhoto(propertyId: string, name: string) {
  const path = `${PHOTO_PREFIX}/${name}`;
  return (await prisma.visit.count({ where: { propertyId, OR: [{ beforePhoto: path }, { afterPhoto: path }] } })) > 0;
}
