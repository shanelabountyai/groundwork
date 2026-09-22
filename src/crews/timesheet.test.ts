import { beforeEach, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { prisma } from '../db';
import { makeAgreement, makeCrew, resetDb } from '../test/harness';
import { toDbDate } from '../time';
import { generateVisits } from '../visits/generate';
import { ClockRefused, clockIn, clockOut, openShift, personDayRows, timesheetRows } from './timesheet';

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

async function crewUser(crewId: string, name: string, phone: string) {
  const u = await prisma.user.create({ data: { name, phone, role: 'crew', crewId } });
  return { userId: u.id, name, crewId };
}

it('clock in/out is per person; a second clock-in or a stray clock-out is refused', async () => {
  const crew = await makeCrew('Punch');
  const ana = await crewUser(crew.id, 'Ana', '+19185550101');
  const ben = await crewUser(crew.id, 'Ben', '+19185550102');
  const clock = fixedClock('2026-03-02T13:00:00Z');

  await clockIn(ana, clock);
  await expect(clockIn(ana, clock)).rejects.toThrow(ClockRefused);
  await expect(clockOut(ben.userId, clock)).rejects.toThrow(ClockRefused);
  await clockIn(ben, clock); // a crewmate's open shift doesn't block anyone else

  clock.advance(2 * 3600_000);
  await clockOut(ana.userId, clock);
  expect(await openShift(ana.userId)).toBeNull();
  expect(await openShift(ben.userId)).not.toBeNull();
  await expect(clockOut(ana.userId, clock)).rejects.toThrow(ClockRefused);
});

it('sums TimeEntry per person per day, independent of visit timestamps', async () => {
  const crew = await makeCrew('Ledger');
  const ana = await crewUser(crew.id, 'Ana', '+19185550101');
  const ben = await crewUser(crew.id, 'Ben', '+19185550102');
  const cal = await crewUser(crew.id, 'Cal', '+19185550103');
  const shift = async (u: typeof ana, from: string, to: string | null) => {
    await clockIn(u, fixedClock(from));
    if (to) await clockOut(u.userId, fixedClock(to));
  };

  // Ana: two shifts Monday (morning + after lunch) = 3.5h + 4h.
  await shift(ana, '2026-03-02T13:00:00Z', '2026-03-02T16:30:00Z');
  await shift(ana, '2026-03-02T17:15:00Z', '2026-03-02T21:15:00Z');
  // Ben: Tuesday 22:00–01:00 Chicago crosses midnight, counts to Tuesday (3h).
  await shift(ben, '2026-03-04T04:00:00Z', '2026-03-04T07:00:00Z');
  // Ben: still clocked in on Friday — flagged, zero hours counted.
  await shift(ben, '2026-03-06T14:00:00Z', null);
  // Cal: the next Monday is outside the week; then Cal's account is deleted — Wednesday's hours stay.
  await shift(cal, '2026-03-09T14:00:00Z', '2026-03-09T15:00:00Z');
  await shift(cal, '2026-03-04T14:00:00Z', '2026-03-04T20:00:00Z');
  await prisma.user.delete({ where: { id: cal.userId } });

  // A completed visit with its own timestamps changes none of the above.
  await makeAgreement('one_time', '2026-03-02', { crewId: crew.id });
  await generateVisits(fixedClock('2026-03-02T12:00:00Z'), { date: '2026-03-02' });
  const v = await prisma.visit.findFirstOrThrow();
  await prisma.visit.update({ where: { id: v.id }, data: { status: 'completed', startedAt: new Date('2026-03-02T14:00:00Z'), finishedAt: new Date('2026-03-02T23:00:00Z') } });

  expect(await personDayRows('2026-03-02')).toEqual([
    { name: 'Ana', crew: 'Ledger', date: '2026-03-02', hours: 7.5, open: false },
    { name: 'Ben', crew: 'Ledger', date: '2026-03-03', hours: 3, open: false },
    { name: 'Cal', crew: 'Ledger', date: '2026-03-04', hours: 6, open: false },
    { name: 'Ben', crew: 'Ledger', date: '2026-03-06', hours: 0, open: true },
  ]);
});
