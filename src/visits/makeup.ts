import { CapacityExceeded, dayLoad, overCapacity, type Capacity } from '../crews/capacity';
import { prisma } from '../db';
import { addDays, fromDbDate, shortDay, toDbDate, type LocalDate } from '../time';
import { nextServiceDay } from './cascade';

/**
 * The make-up offer (P1-1). A skipped stop still owes service, so the
 * dispatcher is offered the next service day this crew can absorb it on — the
 * same load rule the capacity check uses — and one click books it.
 *
 * The skip stays as history: the make-up is a new, detached row, so the
 * completion-rate report still counts the skip and its reason, and the money
 * is right either way (a skipped visit never completes, so it earns nothing).
 *
 * The make-up's occurrence slot is the skipped visit's plus a day, which no
 * frequency can produce — the shortest step is a week — so it never takes a
 * slot the pattern wants, and the unique indexes on (agreement, occurrence)
 * and (job, occurrence) make booking the same make-up twice impossible. A
 * make-up keeps its skipped visit's origin, so a job's make-up is the job's.
 */

/** How far ahead an offer looks before giving up. */
export const OFFER_DAYS = 14;

/** The occurrence slot a make-up of `occurrenceDate` takes. */
export const makeUpSlot = (occurrenceDate: LocalDate) => addDays(occurrenceDate, 1);

/** Refused: not a skipped stop, a make-up already booked, or a bad date. */
export class MakeUpRefused extends Error {}

/**
 * The first service day after `after` where this crew can take `minutes` more
 * work without going over. Null when the horizon is full — no silent overload.
 */
export async function offerSlot(crewId: string, after: LocalDate, minutes: number, horizonDays = OFFER_DAYS) {
  const crew = await prisma.crew.findUnique({ where: { id: crewId }, select: { maxStops: true, maxMinutes: true } });
  if (!crew) return null;
  const last = addDays(after, horizonDays);
  const days: LocalDate[] = [];
  for (let d = nextServiceDay(after); d <= last; d = nextServiceDay(d)) days.push(d);
  if (!days.length) return null;

  const visits = await prisma.visit.findMany({
    where: { crewId, date: { gte: toDbDate(days[0]!), lte: toDbDate(days.at(-1)!) }, status: { not: 'skipped' } },
    select: { date: true, serviceType: { select: { estimatedMinutes: true } } },
  });
  return days.find((date) => {
    const here = visits.filter((v) => fromDbDate(v.date) === date);
    const load = {
      stops: here.length + 1,
      minutes: here.reduce((m, v) => m + v.serviceType.estimatedMinutes, 0) + minutes,
    };
    return !overCapacity(load, crew);
  }) ?? null;
}

export interface SkipOffer {
  /** A make-up already on the books, if one is. */
  booked: LocalDate | null;
  /** Otherwise the day being offered — null when nothing fits the horizon. */
  offer: LocalDate | null;
}

type SkippedStop = {
  id: string;
  agreementId: string | null;
  jobId: string | null;
  occurrenceDate: Date;
  date: Date;
  serviceType: { estimatedMinutes: number };
};

/** The visit an origin would put in `occurrenceDate`'s slot — null matches null, so exactly one origin is compared. */
const sameSlot = (s: { agreementId: string | null; jobId: string | null }, occurrenceDate: LocalDate) =>
  ({ agreementId: s.agreementId, jobId: s.jobId, occurrenceDate: toDbDate(occurrenceDate) });

/** What the day page shows under each skipped stop, keyed by visit id. */
export async function skipOffers(crewId: string, skipped: SkippedStop[]): Promise<Map<string, SkipOffer>> {
  if (!skipped.length) return new Map();
  const slot = (s: SkippedStop) => makeUpSlot(fromDbDate(s.occurrenceDate));
  const booked = await prisma.visit.findMany({
    where: { OR: skipped.map((s) => sameSlot(s, slot(s))) },
    select: { agreementId: true, jobId: true, occurrenceDate: true, date: true },
  });
  // ponytail: one offer query per skipped stop; a crew-day rarely has more than a couple.
  return new Map(
    await Promise.all(
      skipped.map(async (s): Promise<[string, SkipOffer]> => {
        const hit = booked.find((b) => b.agreementId === s.agreementId && b.jobId === s.jobId && fromDbDate(b.occurrenceDate) === slot(s));
        return [s.id, {
          booked: hit ? fromDbDate(hit.date) : null,
          offer: hit ? null : await offerSlot(crewId, fromDbDate(s.date), s.serviceType.estimatedMinutes),
        }];
      }),
    ),
  );
}

/**
 * Book the make-up. Capacity is re-checked here, not trusted from the offer:
 * between rendering the button and clicking it the day can fill up.
 */
export async function bookMakeUp(visitId: string, date: LocalDate) {
  if (!(/^\d{4}-\d{2}-\d{2}$/.test(date) && fromDbDate(toDbDate(date)) === date)) {
    throw new MakeUpRefused(`Not a date: ${date}`);
  }
  return prisma.$transaction(async (tx) => {
    const skipped = await tx.visit.findUnique({
      where: { id: visitId },
      include: { property: true, serviceType: true },
    });
    if (!skipped || skipped.status !== 'skipped') throw new MakeUpRefused('Only a skipped stop gets a make-up');
    if (date <= fromDbDate(skipped.date)) throw new MakeUpRefused('A make-up goes after the day it was skipped');

    const crewId = skipped.crewId;
    // Same lock as rescheduleVisit: bookings into this crew serialize, so the load measured below stays true.
    const [crew] = await tx.$queryRaw<Capacity[]>`
      SELECT "maxStops", "maxMinutes" FROM "Crew" WHERE id = ${crewId} FOR UPDATE`;
    if (!crew) throw new MakeUpRefused(`No crew ${crewId}`);

    const occurrenceDate = makeUpSlot(fromDbDate(skipped.occurrenceDate));
    const already = await tx.visit.findFirst({ where: sameSlot(skipped, occurrenceDate), select: { date: true } });
    if (already) throw new MakeUpRefused(`A make-up is already booked for ${shortDay(fromDbDate(already.date))}`);

    const visit = await tx.visit.create({
      data: {
        agreementId: skipped.agreementId,
        jobId: skipped.jobId,
        propertyId: skipped.propertyId,
        serviceTypeId: skipped.serviceTypeId,
        occurrenceDate: toDbDate(occurrenceDate),
        date: toDbDate(date),
        crewId,
        // Detached from the first moment: a person placed it, so no horizon run may withdraw it.
        detached: true,
        // The skipped visit's snapshot: the customer owes what they owed.
        priceCents: skipped.priceCents,
      },
    });

    // Measured after the insert, like rescheduleVisit; throwing rolls it back.
    const load = await dayLoad(tx, crewId, date);
    if (overCapacity(load, crew)) throw new CapacityExceeded(load, crew);

    const p = skipped.property;
    await tx.notification.create({
      data: {
        visitId: visit.id,
        channel: p.customerEmail ? 'email' : 'sms',
        to: p.customerEmail ?? p.customerPhone,
        body: `Evergreen Property Care: we missed your ${skipped.serviceType.name} at ${p.address} — we'll be back ${shortDay(date)}.`,
      },
    });
    return visit;
  });
}
