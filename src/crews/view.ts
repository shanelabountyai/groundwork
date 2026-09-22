import { prisma } from '../db';
import { routeFor } from '../routes/day';
import type { LocalDate } from '../time';

/**
 * What a crew's phone gets for a day. Crews never see price (CLAUDE.md rule 6):
 * the gate is this explicit projection, so price is not hidden from the crew
 * view, it is never sent to it. Add a field here deliberately or not at all.
 */
export async function crewDay(crewId: string, date: LocalDate) {
  const crew = await prisma.crew.findUnique({ where: { id: crewId }, select: { id: true, name: true } });
  if (!crew) return null;
  const { stops } = await routeFor(crewId, date);
  return {
    crew,
    date,
    stops: stops.map((v) => ({
      id: v.id,
      status: v.status,
      skipReason: v.skipReason,
      note: v.note,
      service: v.serviceType.name,
      minutes: v.serviceType.estimatedMinutes,
      address: v.property.address,
      lat: v.property.lat,
      lng: v.property.lng,
      accessNotes: v.property.accessNotes,
      customerName: v.property.customerName,
      customerPhone: v.property.customerPhone,
    })),
  };
}

export type CrewStop = NonNullable<Awaited<ReturnType<typeof crewDay>>>['stops'][number];
