import { systemClock, type Clock } from '../clock';
import { prisma } from '../db';
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
