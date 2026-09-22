import type { Clock } from '../clock';
import { prisma } from '../db';
import { fromDbDate, localDateOf, toDbDate, type LocalDate } from '../time';

/** Refused: a bad or past date, or a negative price. */
export class PlacementRefused extends Error {}

/**
 * BO-3: a one-off job and its one visit, in one step, on the chosen crew-day.
 * Deliberately not capacity-checked (back-office PRD, Non-Goals): like horizon
 * generation, it can overload a day, and the board's colouring is the signal.
 */
export async function placeJob(clock: Clock, data: {
  propertyId: string; serviceTypeId: string; crewId: string; date: LocalDate; priceCents: number; createdBy: string;
}) {
  const { date, crewId, ...job } = data;
  if (!(/^\d{4}-\d{2}-\d{2}$/.test(date) && fromDbDate(toDbDate(date)) === date)) throw new PlacementRefused(`Not a date: ${date}`);
  // A crew can only update today's stops, so a job placed in the past could never be completed.
  if (date < localDateOf(clock.now())) throw new PlacementRefused('A job goes on today or later');
  if (!Number.isInteger(job.priceCents) || job.priceCents < 0) throw new PlacementRefused('Price must be whole cents, not negative');

  return prisma.$transaction(async (tx) => {
    const created = await tx.job.create({ data: job });
    const visit = await tx.visit.create({
      data: {
        jobId: created.id,
        propertyId: job.propertyId,
        serviceTypeId: job.serviceTypeId,
        occurrenceDate: toDbDate(date),
        date: toDbDate(date),
        crewId,
        priceCents: job.priceCents,
      },
    });
    return { job: created, visit };
  });
}
