import { prisma } from '../db';
import { addDays, fromDbDate, toDbDate, type LocalDate } from '../time';

/**
 * BO-9: the owner's report widened to a run of weeks (a quarter by default),
 * broken out by week, crew and customer. One visit query over the whole range,
 * grouped in memory — never a query per week, same as `ownerReport`.
 *
 * Same definitions as the weekly report: rate is out of resolved visits
 * (completed + skipped), value is completed visits at their snapshotted price.
 * Miles are left to the weekly page; the drive estimate is per crew-day and
 * a quarter of it is not what the trend is for.
 *
 * "Crew lead" is the crew: a visit records which crew did it, not which
 * person (decisions.md, Phase 18), so that is the finest grain that exists.
 */
export interface Tally { completed: number; skipped: number; open: number; completionRate: number | null; scheduledCents: number }

const empty = (): Tally => ({ completed: 0, skipped: 0, open: 0, completionRate: null, scheduledCents: 0 });

function add(t: Tally, status: string, priceCents: number) {
  if (status === 'completed') { t.completed++; t.scheduledCents += priceCents; }
  else if (status === 'skipped') t.skipped++;
  else t.open++;
}

const rate = <T extends Tally>(t: T): T => { const r = t.completed + t.skipped; t.completionRate = r ? t.completed / r : null; return t; };

export async function rangeReport(firstMonday: LocalDate, weeks: number) {
  const mondays = Array.from({ length: weeks }, (_, i) => addDays(firstMonday, i * 7));
  const visits = await prisma.visit.findMany({
    where: { date: { gte: toDbDate(firstMonday), lte: toDbDate(addDays(firstMonday, weeks * 7 - 1)) } },
    select: {
      date: true, status: true, priceCents: true,
      crew: { select: { id: true, name: true } },
      property: { select: { id: true, customerName: true, address: true } },
    },
  });

  const total = empty();
  const byWeek = new Map(mondays.map((m) => [m, empty()]));
  const byCrew = new Map<string, Tally & { name: string }>();
  const byCustomer = new Map<string, Tally & { name: string; address: string }>();
  for (const v of visits) {
    const week = addDays(fromDbDate(v.date), -((v.date.getUTCDay() + 6) % 7));
    add(total, v.status, v.priceCents);
    add(byWeek.get(week)!, v.status, v.priceCents);
    add(byCrew.get(v.crew.id) ?? byCrew.set(v.crew.id, { ...empty(), name: v.crew.name }).get(v.crew.id)!, v.status, v.priceCents);
    const p = v.property;
    add(byCustomer.get(p.id) ?? byCustomer.set(p.id, { ...empty(), name: p.customerName, address: p.address }).get(p.id)!, v.status, v.priceCents);
  }
  return {
    mondays,
    total: rate(total),
    weeks: mondays.map((monday) => ({ monday, ...rate(byWeek.get(monday)!) })),
    crews: [...byCrew.values()].map(rate).sort((a, b) => b.scheduledCents - a.scheduledCents || a.name.localeCompare(b.name)),
    customers: [...byCustomer.values()].map(rate).sort((a, b) => b.scheduledCents - a.scheduledCents || a.name.localeCompare(b.name)),
  };
}
