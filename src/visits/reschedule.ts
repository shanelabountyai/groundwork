import { systemClock, type Clock } from '../clock';
import { CapacityExceeded, dayLoad, overCapacity } from '../crews/capacity';
import { prisma, type Tx } from '../db';
import { addDays, fromDbDate, localDateOf, toDbDate, type LocalDate } from '../time';
import { isServiceDay } from './cascade';
import { bookMakeUp } from './makeup';
import { customerSkip } from './status';

/**
 * PX-1: a customer moves a visit to any day in an open window. The visit is
 * skipped (reason customer_request) and re-booked through `bookMakeUp`, so it
 * keeps the original's snapshotted price and detaches from its pattern. A day
 * that fits books at once; one that doesn't becomes a `RescheduleRequest` for
 * a dispatcher, and is never silently booked over capacity.
 */

/** How far ahead a customer may pick. */
export const RESCHEDULE_DAYS = 60;

/** Refused: a bad date, or a visit that is not this customer's to move. */
export class RescheduleRefused extends Error {}

/** The soonest a customer may pick: crews only act on today's stops, so tomorrow. */
export const earliestPick = (clock: Clock = systemClock) => addDays(localDateOf(clock.now()), 1);
export const latestPick = (clock: Clock = systemClock) => addDays(localDateOf(clock.now()), RESCHEDULE_DAYS);

export function checkPick(date: string, clock: Clock = systemClock): asserts date is LocalDate {
  if (!(/^\d{4}-\d{2}-\d{2}$/.test(date) && fromDbDate(toDbDate(date)) === date)) throw new RescheduleRefused('Pick a date');
  if (date < earliestPick(clock) || date > latestPick(clock)) throw new RescheduleRefused('Pick a day within the next 60 days');
  if (!isServiceDay(date)) throw new RescheduleRefused('We work Monday to Friday — pick a weekday');
}

/** Whether the visit's own crew can take it on `date` — what the confirm step tells the customer. */
export async function fitsOn(visitId: string, date: LocalDate) {
  const v = await prisma.visit.findUniqueOrThrow({
    where: { id: visitId },
    select: { crewId: true, crew: { select: { maxStops: true, maxMinutes: true } }, serviceType: { select: { estimatedMinutes: true } } },
  });
  const load = await dayLoad(prisma, v.crewId, date);
  return !overCapacity({ stops: load.stops + 1, minutes: load.minutes + v.serviceType.estimatedMinutes }, v.crew);
}

/** Days in the pick window where the visit's crew has no room for it — one query, same rule as `fitsOn`. */
export async function fullDays(visitId: string, clock: Clock = systemClock): Promise<Set<string>> {
  const v = await prisma.visit.findUniqueOrThrow({
    where: { id: visitId },
    select: { crewId: true, crew: { select: { maxStops: true, maxMinutes: true } }, serviceType: { select: { estimatedMinutes: true } } },
  });
  const rows = await prisma.visit.findMany({
    where: { crewId: v.crewId, status: { not: 'skipped' }, date: { gte: toDbDate(earliestPick(clock)), lte: toDbDate(latestPick(clock)) } },
    select: { date: true, serviceType: { select: { estimatedMinutes: true } } },
  });
  const load = new Map<string, { stops: number; minutes: number }>();
  for (const r of rows) {
    const key = fromDbDate(r.date);
    const l = load.get(key) ?? { stops: 0, minutes: 0 };
    load.set(key, { stops: l.stops + 1, minutes: l.minutes + r.serviceType.estimatedMinutes });
  }
  return new Set([...load].filter(([, l]) => overCapacity({ stops: l.stops + 1, minutes: l.minutes + v.serviceType.estimatedMinutes }, v.crew)).map(([d]) => d));
}

/** Skips the visit, then books `date` or queues it for review — skip and outcome commit together, or not at all. */
export async function requestReschedule(visitId: string, propertyId: string, date: string, clock: Clock = systemClock) {
  checkPick(date, clock);
  // A customer whose last request was declined is retrying: the visit is already skipped, so there is nothing to skip again.
  const skip = async (tx: Tx) => {
    const last = await tx.rescheduleRequest.findFirst({ where: { visitId }, orderBy: { createdAt: 'desc' }, include: { visit: { select: { propertyId: true } } } });
    if (last?.status === 'declined' && last.visit.propertyId === propertyId) return;
    await customerSkip(visitId, propertyId, clock, tx);
  };
  try {
    await bookMakeUp(visitId, date, { reschedule: true, before: async (tx) => void (await skip(tx)) });
    return 'booked' as const;
  } catch (e) {
    // Re-checked inside the booking, so a day that filled after the preview lands here too. The booking's rollback took the skip with it.
    if (!(e instanceof CapacityExceeded)) throw e;
    await prisma.$transaction(async (tx) => {
      await skip(tx);
      await tx.rescheduleRequest.create({ data: { visitId, requestedDate: toDbDate(date) } });
    });
    return 'requested' as const;
  }
}

export class ReviewRefused extends Error {}

const claimPending = async (id: string, data: { status: 'approved' | 'declined'; note?: string; decidedBy: string }, tx: Tx = prisma) => {
  const { count } = await tx.rescheduleRequest.updateMany({ where: { id, status: 'pending' }, data: { ...data, resolvedAt: systemClock.now() } });
  if (count === 0) throw new ReviewRefused('Already resolved; reload');
};

/** Books the request over capacity, through the same logged override as a pushed day. */
export async function approveReschedule(id: string, by: string) {
  const r = await prisma.rescheduleRequest.findUniqueOrThrow({ where: { id } });
  return bookMakeUp(r.visitId, fromDbDate(r.requestedDate), {
    reschedule: true,
    override: { reason: 'Customer reschedule approved', by },
    after: (tx) => claimPending(id, { status: 'approved', decidedBy: by }, tx),
  });
}

export async function declineReschedule(id: string, note: string, by: string) {
  if (!note.trim()) throw new ReviewRefused('Say why, so the customer knows what to do next');
  await claimPending(id, { status: 'declined', note: note.trim(), decidedBy: by });
}

/** The dispatcher's queue, oldest first. */
export const pendingRequests = () =>
  prisma.rescheduleRequest.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    include: { visit: { include: { property: true, serviceType: true, crew: true } } },
  });

/** The last `take` decisions, newest first. */
export const decidedRequests = (take = 10) =>
  prisma.rescheduleRequest.findMany({
    where: { status: { not: 'pending' } },
    orderBy: { resolvedAt: 'desc' },
    take,
    include: { visit: { include: { property: true, serviceType: true } } },
  });
