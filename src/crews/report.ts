import { prisma } from '../db';
import type { SkipReason } from '../generated/prisma/client';
import { drivenOrder } from '../routes/route';
import { estimateDrive } from '../routes/routing';
import { addDays, fromDbDate, localDateOf, toDbDate, type LocalDate } from '../time';

/**
 * The owner's week (P1-2): did the work happen, what did it earn, what did it
 * cost to drive. One query over the week, grouped in memory — the board's
 * shape, with money added, so a dispatcher and an owner read the same week.
 *
 * Three definitions that a reader will otherwise guess wrong, so they are
 * stated here and on the page:
 *
 * - **Completion rate is out of what was resolved** (completed + skipped), not
 *   out of everything scheduled. A future week is all `open`, and a rate of 0%
 *   for work that has not happened yet would be a lie.
 * - **Scheduled value is completed visits only**, at the price each visit
 *   snapshotted when it was generated. A price change today cannot rewrite
 *   last week. It is what the work was worth, not money in hand — that is
 *   `invoicedCents`/`collectedCents`, read from invoices (BO-4), by the day
 *   the invoice went out or was paid rather than the day the work was done.
 * - **Miles include skipped stops.** The crew drove the route that was
 *   dispatched; a locked gate does not refund the drive. It is the same
 *   straight-line estimate the route page shows, not drive time.
 */
export interface CrewReport {
  id: string;
  name: string;
  completed: number;
  skipped: number;
  /** Still pending or en route — no outcome yet. */
  open: number;
  /** completed / (completed + skipped), or null if nothing resolved. */
  completionRate: number | null;
  scheduledCents: number;
  miles: number;
  driveMinutes: number;
  /** Most common first. Only reasons that occurred. */
  skips: { reason: SkipReason; count: number }[];
}

export async function ownerReport(monday: LocalDate) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const [crews, visits, invoices] = await Promise.all([
    prisma.crew.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, homeLat: true, homeLng: true } }),
    prisma.visit.findMany({
      where: { date: { gte: toDbDate(days[0]!), lte: toDbDate(days[6]!) } },
      // Same order routeFor reads a day in, so drivenOrder sees the same route.
      orderBy: [{ routePosition: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        crewId: true, date: true, status: true, priceCents: true, skipReason: true, routePosition: true,
        property: { select: { lat: true, lng: true } },
      },
    }),
    // A day of slack either side of the week covers the Chicago/UTC offset; the filter below is exact.
    prisma.invoice.findMany({
      where: {
        status: { notIn: ['draft', 'void'] },
        OR: [{ sentAt: { gte: toDbDate(addDays(monday, -1)), lt: toDbDate(addDays(monday, 8)) } },
          { paidAt: { gte: toDbDate(addDays(monday, -1)), lt: toDbDate(addDays(monday, 8)) } }],
      },
      select: { status: true, amountCents: true, sentAt: true, paidAt: true },
    }),
  ]);
  const inWeek = (t: Date | null) => !!t && days.includes(localDateOf(t));

  const report: CrewReport[] = await Promise.all(crews.map(async (crew) => {
    const mine = visits.filter((v) => v.crewId === crew.id);
    const completed = mine.filter((v) => v.status === 'completed');
    const skipped = mine.filter((v) => v.status === 'skipped');
    const resolved = completed.length + skipped.length;

    const home = { lat: crew.homeLat, lng: crew.homeLng };
    const driven = await Promise.all(days.map((date) => {
      const stops = mine
        .filter((v) => fromDbDate(v.date) === date)
        .map((v) => ({ lat: v.property.lat, lng: v.property.lng, routePosition: v.routePosition }));
      return estimateDrive(home, drivenOrder(home, stops).ordered);
    }));

    const counts = new Map<SkipReason, number>();
    for (const v of skipped) if (v.skipReason) counts.set(v.skipReason, (counts.get(v.skipReason) ?? 0) + 1);

    return {
      id: crew.id,
      name: crew.name,
      completed: completed.length,
      skipped: skipped.length,
      open: mine.length - resolved,
      completionRate: resolved ? completed.length / resolved : null,
      scheduledCents: completed.reduce((c, v) => c + v.priceCents, 0),
      miles: Math.round(driven.reduce((m, d) => m + d.miles, 0) * 10) / 10,
      driveMinutes: driven.reduce((m, d) => m + d.driveMinutes, 0),
      skips: [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    };
  }));

  const sum = (f: (c: CrewReport) => number) => report.reduce((t, c) => t + f(c), 0);
  const resolved = sum((c) => c.completed) + sum((c) => c.skipped);
  return {
    days,
    crews: report,
    totals: {
      completed: sum((c) => c.completed),
      skipped: sum((c) => c.skipped),
      open: sum((c) => c.open),
      completionRate: resolved ? sum((c) => c.completed) / resolved : null,
      scheduledCents: sum((c) => c.scheduledCents),
      invoicedCents: invoices.filter((i) => inWeek(i.sentAt)).reduce((t, i) => t + i.amountCents, 0),
      /** Refunded money is no longer collected. */
      collectedCents: invoices.filter((i) => i.status === 'paid' && inWeek(i.paidAt)).reduce((t, i) => t + i.amountCents, 0),
      miles: Math.round(sum((c) => c.miles) * 10) / 10,
      driveMinutes: sum((c) => c.driveMinutes),
    },
  };
}
