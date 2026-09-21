import type { Clock } from '../clock';
import { CapacityExceeded, dayLoad, overCapacity, type Capacity, type Override } from '../crews/capacity';
import { prisma, type Tx } from '../db';
import type { Agreement } from '../generated/prisma/client';
import { addDays, fromDbDate, localDateOf, toDbDate, type LocalDate } from '../time';
import { planVisits, type Frequency, type Window } from './recurrence';

/** Default rolling horizon: four weeks ahead, inclusive, so a biweekly Mar 2 start reaches Mar 30. */
export const HORIZON_DAYS = 28;

export const today = (clock: Clock) => localDateOf(clock.now());

/** Bring one agreement's visits in line with its pattern inside the window. */
async function syncAgreement(tx: Tx, a: Agreement, w: Window) {
  const rows = await tx.visit.findMany({
    where: { agreementId: a.id, OR: [{ occurrenceDate: { gte: toDbDate(w.from) } }, { date: { gte: toDbDate(w.from) } }] },
    select: { id: true, occurrenceDate: true, date: true, detached: true, status: true },
  });
  const plan = planVisits(
    { frequency: a.frequency, startDate: fromDbDate(a.startDate) },
    rows.map((r) => ({ ...r, occurrenceDate: fromDbDate(r.occurrenceDate), date: fromDbDate(r.date) })),
    w,
    { active: !a.paused },
  );

  // The status and detached conditions are repeated in SQL so a visit that
  // started or moved since the read above is never withdrawn.
  const withdrawn = plan.obsolete.length
    ? (await tx.visit.deleteMany({ where: { id: { in: plan.obsolete.map((v) => v.id) }, status: 'pending', detached: false } })).count
    : 0;
  // skipDuplicates plus the (agreementId, occurrenceDate) unique index make a concurrent run harmless.
  const created = plan.create.length
    ? (await tx.visit.createMany({
        data: plan.create.map((d) => ({
          agreementId: a.id, occurrenceDate: toDbDate(d), date: toDbDate(d), crewId: a.crewId, priceCents: a.priceCents,
        })),
        skipDuplicates: true,
      })).count
    : 0;
  return { created, withdrawn };
}

/** The horizon job behind `visits:generate --date=`. Idempotent: a second run changes nothing. */
export async function generateVisits(clock: Clock, opts: { date?: LocalDate; horizonDays?: number } = {}) {
  const from = opts.date ?? today(clock);
  const w = { from, to: addDays(from, opts.horizonDays ?? HORIZON_DAYS) };
  const totals = { agreements: 0, created: 0, withdrawn: 0 };
  // ponytail: loads every agreement at once; page through them if the book grows past a few thousand.
  for (const a of await prisma.agreement.findMany()) {
    const r = await prisma.$transaction((tx) => syncAgreement(tx, a, w));
    totals.agreements++;
    totals.created += r.created;
    totals.withdrawn += r.withdrawn;
  }
  return totals;
}

/** A new agreement, generated into the horizon immediately — a signup doesn't wait for the next scheduled run. */
export async function createAgreement(clock: Clock, data: {
  propertyId: string; serviceTypeId: string; crewId: string; frequency: Frequency; priceCents: number; startDate: LocalDate;
}) {
  const from = today(clock);
  return prisma.$transaction(async (tx) => {
    const a = await tx.agreement.create({
      data: {
        frequency: data.frequency,
        priceCents: data.priceCents,
        startDate: toDbDate(data.startDate),
        property: { connect: { id: data.propertyId } },
        serviceType: { connect: { id: data.serviceTypeId } },
        crew: { connect: { id: data.crewId } },
      },
    });
    const r = await syncAgreement(tx, a, { from, to: addDays(from, HORIZON_DAYS) });
    return { agreement: a, ...r };
  });
}

export interface AgreementChanges {
  frequency?: Frequency;
  startDate?: LocalDate;
  crewId?: string;
  priceCents?: number;
  paused?: boolean;
}

/**
 * Edit a pattern and regenerate its future in one transaction. Only future,
 * pending, attached visits follow the edit; completed and skipped history and
 * hand-moved visits stay exactly as they are.
 */
export async function editAgreement(clock: Clock, id: string, changes: AgreementChanges) {
  const from = today(clock);
  return prisma.$transaction(async (tx) => {
    const { startDate, ...rest } = changes;
    const a = await tx.agreement.update({
      where: { id },
      data: { ...rest, ...(startDate ? { startDate: toDbDate(startDate) } : {}) },
    });
    if (changes.crewId !== undefined || changes.priceCents !== undefined) {
      await tx.visit.updateMany({
        where: { agreementId: id, date: { gte: toDbDate(from) }, status: 'pending', detached: false },
        // A crew change moves the visit into another crew's day; its old position means nothing there.
        data: { crewId: a.crewId, priceCents: a.priceCents, ...(changes.crewId !== undefined ? { routePosition: null } : {}) },
      });
    }
    return syncAgreement(tx, a, { from, to: addDays(from, HORIZON_DAYS) });
  });
}

/**
 * Move one pending visit to another day and/or crew. It keeps its occurrence
 * slot and detaches from the pattern, so regeneration never refills the date
 * it left. A move that overloads the target crew-day throws CapacityExceeded
 * unless the dispatcher passes an override, which is logged.
 */
export async function rescheduleVisit(
  visitId: string,
  date: LocalDate,
  opts: { crewId?: string; override?: Override } = {},
) {
  if (opts.override && !(opts.override.reason.trim() && opts.override.by.trim())) {
    throw new Error('A capacity override needs a reason and who made it');
  }
  return prisma.$transaction(async (tx) => {
    const current = await tx.visit.findUniqueOrThrow({ where: { id: visitId }, select: { crewId: true } });
    const crewId = opts.crewId ?? current.crewId;
    // Serializes moves into the same crew, so two can't both pass the check.
    const [crew] = await tx.$queryRaw<Capacity[]>`
      SELECT "maxStops", "maxMinutes" FROM "Crew" WHERE id = ${crewId} FOR UPDATE`;
    if (!crew) throw new Error(`No crew ${crewId}`);

    const { count } = await tx.visit.updateMany({
      where: { id: visitId, status: 'pending' },
      // routePosition belonged to the old day's order; the new day places it.
      data: { date: toDbDate(date), crewId, detached: true, routePosition: null },
    });
    if (count === 0) throw new Error('Only a pending visit can be rescheduled');

    // Measured after the move; throwing rolls it back.
    const load = await dayLoad(tx, crewId, date);
    if (overCapacity(load, crew)) {
      if (!opts.override) throw new CapacityExceeded(load, crew);
      await tx.capacityOverride.create({
        data: { crewId, date: toDbDate(date), visitId, ...load, reason: opts.override.reason, by: opts.override.by },
      });
    }
  });
}
