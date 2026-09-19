import type { Clock } from '../clock';
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
        data: { crewId: a.crewId, priceCents: a.priceCents },
      });
    }
    return syncAgreement(tx, a, { from, to: addDays(from, HORIZON_DAYS) });
  });
}

/**
 * Move one pending visit to another day. It keeps its occurrence slot and
 * detaches from the pattern, so regeneration never refills the date it left.
 */
export async function rescheduleVisit(visitId: string, date: LocalDate) {
  const { count } = await prisma.visit.updateMany({
    where: { id: visitId, status: 'pending' },
    data: { date: toDbDate(date), detached: true },
  });
  if (count === 0) throw new Error('Only a pending visit can be rescheduled');
}
