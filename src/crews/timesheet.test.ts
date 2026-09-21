import { beforeEach, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { prisma } from '../db';
import { makeAgreement, makeCrew, resetDb } from '../test/harness';
import { toDbDate } from '../time';
import { generateVisits } from '../visits/generate';
import { timesheetRows } from './timesheet';

beforeEach(resetDb);

it('one row per completed visit with hours from started/finished; skipped and pending excluded', async () => {
  const crew = await makeCrew('Ledger');
  await makeAgreement('one_time', '2026-03-02', { crewId: crew.id });
  await makeAgreement('one_time', '2026-03-02', { crewId: crew.id });
  await makeAgreement('one_time', '2026-03-02', { crewId: crew.id });
  // Outside the week — must not show up even though it's completed.
  await makeAgreement('one_time', '2026-03-10', { crewId: crew.id });
  await generateVisits(fixedClock('2026-03-02T12:00:00Z'), { date: '2026-03-02' });
  await generateVisits(fixedClock('2026-03-10T12:00:00Z'), { date: '2026-03-10' });

  const visits = await prisma.visit.findMany({ where: { date: toDbDate('2026-03-02') }, orderBy: { id: 'asc' } });
  await prisma.visit.update({
    where: { id: visits[0]!.id },
    data: { status: 'completed', startedAt: new Date('2026-03-02T14:00:00Z'), finishedAt: new Date('2026-03-02T15:30:00Z') },
  });
  await prisma.visit.update({
    where: { id: visits[1]!.id },
    data: { status: 'skipped', skipReason: 'weather', finishedAt: new Date('2026-03-02T15:00:00Z') },
  });
  // visits[2] stays pending.

  const outside = await prisma.visit.findFirstOrThrow({ where: { date: toDbDate('2026-03-10') } });
  await prisma.visit.update({
    where: { id: outside.id },
    data: { status: 'completed', startedAt: new Date('2026-03-10T14:00:00Z'), finishedAt: new Date('2026-03-10T15:00:00Z') },
  });

  const rows = await timesheetRows('2026-03-02');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ crew: 'Ledger', date: '2026-03-02', hours: 1.5 });
});
