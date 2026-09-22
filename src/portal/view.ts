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
  return {
    property,
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
