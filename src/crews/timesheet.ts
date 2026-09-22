import { systemClock, type Clock } from '../clock';
import { prisma } from '../db';
import { Prisma } from '../generated/prisma/client';
import { addDays, fromDbDate, localDateOf, toDbDate, type LocalDate } from '../time';

/** A refused clock in/out, worded for the person holding the phone. */
export class ClockRefused extends Error {}

type CrewUser = { userId: string; name: string; crewId: string };

/** Opens a shift. The database's one-open-entry-per-user index is the guard, so a double tap cannot open two. */
export async function clockIn(u: CrewUser, clock: Clock = systemClock) {
  const now = clock.now();
  try {
    return await prisma.timeEntry.create({
      data: { userId: u.userId, name: u.name, crewId: u.crewId, date: toDbDate(localDateOf(now)), clockIn: now },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ClockRefused('You are already clocked in');
    throw e;
  }
}

/** Closes this person's open shift, whichever crew or day it was opened on. */
export async function clockOut(userId: string, clock: Clock = systemClock) {
  const closed = await prisma.timeEntry.updateMany({ where: { userId, clockOut: null }, data: { clockOut: clock.now() } });
  if (closed.count === 0) throw new ClockRefused('You are not clocked in');
}

export const openShift = (userId: string) => prisma.timeEntry.findFirst({ where: { userId, clockOut: null } });

export interface PersonDayRow {
  name: string;
  crew: string;
  date: LocalDate;
  /** Closed shifts only; an open one is flagged, not guessed at. */
  hours: number;
  open: boolean;
}

/**
 * BO-8: hours per person per day from their own TimeEntry rows, not from
 * visit timestamps. Summed in milliseconds and rounded once, so ten short
 * shifts don't accumulate ten roundings.
 */
export async function personDayRows(monday: LocalDate): Promise<PersonDayRow[]> {
  const entries = await prisma.timeEntry.findMany({
    where: { date: { gte: toDbDate(monday), lte: toDbDate(addDays(monday, 6)) } },
    orderBy: [{ date: 'asc' }, { name: 'asc' }, { clockIn: 'asc' }],
    select: { userId: true, name: true, date: true, clockIn: true, clockOut: true, crew: { select: { name: true } } },
  });
  const rows = new Map<string, PersonDayRow & { ms: number }>();
  for (const e of entries) {
    const date = fromDbDate(e.date);
    // A deleted user's rows keep their name but lose their id; group those by name.
    const key = `${e.userId ?? `gone:${e.name}`}|${e.crew.name}|${date}`;
    const row = rows.get(key) ?? { name: e.name, crew: e.crew.name, date, hours: 0, open: false, ms: 0 };
    if (e.clockOut) row.ms += e.clockOut.getTime() - e.clockIn.getTime();
    else row.open = true;
    rows.set(key, row);
  }
  return [...rows.values()].map(({ ms, ...r }) => ({ ...r, hours: Math.round(ms / 36000) / 100 }));
}

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
