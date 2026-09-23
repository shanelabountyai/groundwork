import { beforeEach, expect, it } from 'vitest';
import { prisma } from '../db';
import { makeAgreement, makeCrew, resetDb } from '../test/harness';
import { toDbDate } from '../time';
import { rangeReport } from './range';

beforeEach(resetDb);

it('hand tally over three weeks: per week, per crew, per customer, all from one snapshot price', async () => {
  const crewA = await makeCrew('A');
  const crewB = await makeCrew('B');
  const a = await makeAgreement('one_time', '2026-03-02', { crewId: crewA.id, priceCents: 5000 });
  const b = await makeAgreement('one_time', '2026-03-02', { crewId: crewB.id, priceCents: 3000 });
  const visit = (ag: typeof a, crewId: string, date: string, status: 'completed' | 'skipped' | 'pending', priceCents: number) =>
    prisma.visit.create({ data: { agreementId: ag.id, propertyId: ag.propertyId, crewId, serviceTypeId: ag.serviceTypeId, date: toDbDate(date), occurrenceDate: toDbDate(date), status, priceCents,
      ...(status === 'skipped' ? { skipReason: 'weather', finishedAt: new Date() } : status === 'completed' ? { startedAt: new Date(`${date}T14:00:00Z`), finishedAt: new Date(`${date}T15:00:00Z`) } : {}) } });
  await visit(a, crewA.id, '2026-03-02', 'completed', 5000); // wk1 Mon
  await visit(a, crewA.id, '2026-03-08', 'completed', 5000); // wk1 Sun — still week 1
  await visit(a, crewA.id, '2026-03-09', 'skipped', 5000);   // wk2
  await visit(b, crewB.id, '2026-03-16', 'completed', 3000); // wk3
  await visit(b, crewB.id, '2026-03-17', 'pending', 3000);   // wk3, open
  await visit(b, crewB.id, '2026-03-23', 'completed', 3000); // after the range

  const r = await rangeReport('2026-03-02', 3);
  expect(r.weeks.map((w) => [w.completed, w.skipped, w.open, w.scheduledCents])).toEqual([[2, 0, 0, 10000], [0, 1, 0, 0], [1, 0, 1, 3000]]);
  expect(r.total).toMatchObject({ completed: 3, skipped: 1, open: 1, scheduledCents: 13000 });
  expect(r.total.completionRate).toBe(3 / 4);
  expect(r.crews.map((c) => [c.name, c.scheduledCents, c.completionRate])).toEqual([['A', 10000, 2 / 3], ['B', 3000, 1]]);
  expect(r.customers.map((c) => c.scheduledCents)).toEqual([10000, 3000]);
});
