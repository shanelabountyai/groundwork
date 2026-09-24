import { prisma } from '../db';
import { addDays, fromDbDate, toDbDate, type LocalDate } from '../time';
import { overCapacity } from './capacity';

export type Level = 'empty' | 'light' | 'full' | 'over';

/**
 * The weekly dispatch board (P0-7): crews × seven days from `monday`. A cell's
 * load counts what capacity counts — every non-skipped visit — so the board and
 * the capacity check can never disagree. Skips are shown beside it.
 */
export async function weekBoard(monday: LocalDate) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const [crews, visits] = await Promise.all([
    prisma.crew.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, maxStops: true, maxMinutes: true } }),
    prisma.visit.findMany({
      where: { date: { gte: toDbDate(days[0]!), lte: toDbDate(days[6]!) } },
      select: { crewId: true, date: true, status: true, serviceType: { select: { estimatedMinutes: true } } },
    }),
  ]);
  return {
    days,
    crews: crews.map((crew) => ({
      ...crew,
      cells: days.map((date) => {
        const here = visits.filter((v) => v.crewId === crew.id && fromDbDate(v.date) === date);
        const live = here.filter((v) => v.status !== 'skipped');
        const load = { stops: live.length, minutes: live.reduce((m, v) => m + v.serviceType.estimatedMinutes, 0) };
        const share = Math.max(load.stops / crew.maxStops, load.minutes / crew.maxMinutes);
        const level: Level = !load.stops ? 'empty' : overCapacity(load, crew) ? 'over' : share >= 0.8 ? 'full' : 'light';
        return { date, ...load, skipped: here.length - live.length, done: here.filter((v) => v.status === 'completed').length, level };
      }),
    })),
  };
}

/** The board's "Today" card and "Waiting for you" card: real counts, skips excluded from stops. */
export async function boardSummary(today: LocalDate) {
  const [visits, waiting] = await Promise.all([
    prisma.visit.groupBy({ by: ['status'], where: { date: toDbDate(today) }, _count: true }),
    prisma.rescheduleRequest.count({ where: { status: 'pending' } }),
  ]);
  const n = (s: string) => visits.find((v) => v.status === s)?._count ?? 0;
  const done = n('completed'), enRoute = n('en_route');
  return { waiting, stops: done + enRoute + n('pending'), done, enRoute };
}
