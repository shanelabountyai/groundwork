import { prisma } from '../db';
import { addDays, fromDbDate, toDbDate, type LocalDate } from '../time';

export interface TimesheetRow {
  crew: string;
  date: LocalDate;
  address: string;
  startedAt: Date;
  finishedAt: Date;
  hours: number;
}

/**
 * One row per completed visit in the week (P2 #6). `completed` is the only
 * status with both `startedAt` and `finishedAt` set (src/visits/status.ts) —
 * `skipped` has `finishedAt` but never `startedAt`, so there are no hours to
 * pair it with.
 */
export async function timesheetRows(monday: LocalDate): Promise<TimesheetRow[]> {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const visits = await prisma.visit.findMany({
    where: { status: 'completed', date: { gte: toDbDate(days[0]!), lte: toDbDate(days[6]!) } },
    orderBy: [{ crew: { name: 'asc' } }, { date: 'asc' }, { startedAt: 'asc' }],
    select: {
      date: true, startedAt: true, finishedAt: true,
      crew: { select: { name: true } },
      property: { select: { address: true } },
    },
  });
  return visits.map((v) => ({
    crew: v.crew.name,
    date: fromDbDate(v.date),
    address: v.property.address,
    startedAt: v.startedAt!,
    finishedAt: v.finishedAt!,
    hours: Math.round((v.finishedAt!.getTime() - v.startedAt!.getTime()) / 36000) / 100,
  }));
}
