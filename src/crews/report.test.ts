import { beforeEach, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { prisma } from '../db';
import { routeFor } from '../routes/day';
import { makeAgreement, makeCrew, resetDb } from '../test/harness';
import { toDbDate } from '../time';
import { generateVisits } from '../visits/generate';
import { ownerReport } from './report';

beforeEach(resetDb);

const complete = (id: string, date: string) =>
  prisma.visit.update({
    where: { id },
    data: { status: 'completed', startedAt: new Date(`${date}T14:00:00Z`), finishedAt: new Date(`${date}T15:00:00Z`) },
  });

it('hand tally: rate over resolved visits, revenue from the snapshot, miles agreeing with the route page', async () => {
  const crew = await makeCrew('Ledger');
  await makeCrew('Idle');
  // Mon: three at $45 (two done, one skipped). Tue: two at $60 (one done, one untouched).
  for (let i = 0; i < 3; i++) await makeAgreement('one_time', '2026-03-02', { crewId: crew.id, priceCents: 4500 });
  const tue = await makeAgreement('one_time', '2026-03-03', { crewId: crew.id, priceCents: 6000 });
  await makeAgreement('one_time', '2026-03-03', { crewId: crew.id, priceCents: 6000 });
  await generateVisits(fixedClock('2026-03-02T12:00:00Z'), { date: '2026-03-02' });

  const mon = await prisma.visit.findMany({ where: { date: toDbDate('2026-03-02') }, orderBy: { id: 'asc' } });
  await complete(mon[0]!.id, '2026-03-02');
  await complete(mon[1]!.id, '2026-03-02');
  await prisma.visit.update({
    where: { id: mon[2]!.id },
    data: { status: 'skipped', skipReason: 'weather', finishedAt: new Date('2026-03-02T15:00:00Z') },
  });
  await complete((await prisma.visit.findFirstOrThrow({ where: { agreementId: tue.id } })).id, '2026-03-03');

  // Raising the agreements' price must not rewrite what the completed visits earned.
  await prisma.agreement.updateMany({ data: { priceCents: 99_900 } });

  const { crews, totals } = await ownerReport('2026-03-02');
  const led = crews.find((c) => c.name === 'Ledger')!;
  expect([led.completed, led.skipped, led.open]).toEqual([3, 1, 1]);
  expect(led.completionRate).toBeCloseTo(0.75, 5); // 3 of 4 resolved; the open one is not in the denominator
  expect(led.scheduledCents).toBe(4500 * 2 + 6000);
  expect(led.skips).toEqual([{ reason: 'weather', count: 1 }]);

  // The one number with two implementations: it must match what the dispatcher sees.
  const [m, t] = await Promise.all([routeFor(crew.id, '2026-03-02'), routeFor(crew.id, '2026-03-03')]);
  expect(led.miles).toBeGreaterThan(0);
  expect(led.miles).toBeCloseTo(m.estimate.miles + t.estimate.miles, 1);

  expect(crews.find((c) => c.name === 'Idle')).toMatchObject({ completed: 0, completionRate: null, miles: 0, skips: [] });
  expect(totals).toMatchObject({ completed: 3, skipped: 1, open: 1, scheduledCents: 15_000 });
});
