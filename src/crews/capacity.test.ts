import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { prisma } from '../db';
import { makeAgreement, makeCrew, resetDb } from '../test/harness';
import { toDbDate } from '../time';
import { generateVisits, rescheduleVisit } from '../visits/generate';
import { CapacityExceeded } from './capacity';

const DAY = '2026-03-03';

/** A crew with room for two 30-minute stops, already full on DAY, plus one visit elsewhere to move in. */
async function fullDay() {
  const crew = await makeCrew();
  await prisma.crew.update({ where: { id: crew.id }, data: { maxStops: 2, maxMinutes: 480 } });
  for (let i = 0; i < 2; i++) await makeAgreement('one_time', DAY, { crewId: crew.id });
  const extra = await makeAgreement('one_time', '2026-03-04', { crewId: crew.id });
  await generateVisits(fixedClock('2026-03-02T17:00:00Z'));
  const visit = await prisma.visit.findFirstOrThrow({ where: { agreementId: extra.id } });
  return { crew, visit };
}

beforeEach(resetDb);

describe('capacity', () => {
  it('refuses a move that overloads the day, and leaves the visit where it was', async () => {
    const { visit } = await fullDay();
    await expect(rescheduleVisit(visit.id, DAY)).rejects.toBeInstanceOf(CapacityExceeded);
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).date).toEqual(toDbDate('2026-03-04'));
    expect(await prisma.capacityOverride.count()).toBe(0);
  });

  it('an explicit override moves it and is logged with the load it caused', async () => {
    const { crew, visit } = await fullDay();
    await rescheduleVisit(visit.id, DAY, { override: { reason: 'Customer event Saturday', by: 'dispatch' } });
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).date).toEqual(toDbDate(DAY));
    expect(await prisma.capacityOverride.findMany()).toEqual([
      expect.objectContaining({ crewId: crew.id, visitId: visit.id, stops: 3, minutes: 90, reason: 'Customer event Saturday', by: 'dispatch' }),
    ]);
  });

  it('a blank override reason is refused', async () => {
    const { visit } = await fullDay();
    await expect(rescheduleVisit(visit.id, DAY, { override: { reason: '  ', by: 'dispatch' } })).rejects.toThrow(/reason/);
  });

  it('minutes count too: a day under the stop limit but over the minute limit is refused', async () => {
    const { crew, visit } = await fullDay();
    await prisma.crew.update({ where: { id: crew.id }, data: { maxStops: 10, maxMinutes: 60 } });
    await expect(rescheduleVisit(visit.id, DAY)).rejects.toBeInstanceOf(CapacityExceeded);
  });

  it('skipped visits free their slot', async () => {
    const { crew, visit } = await fullDay();
    await prisma.visit.updateMany({ where: { crewId: crew.id, date: toDbDate(DAY) }, data: { status: 'skipped', skipReason: 'weather', finishedAt: new Date('2026-03-03T15:00:00Z') } });
    await rescheduleVisit(visit.id, DAY);
    expect(await prisma.capacityOverride.count()).toBe(0);
  });

  it('reassigning to another crew checks that crew', async () => {
    const { visit } = await fullDay();
    const other = await makeCrew();
    await prisma.crew.update({ where: { id: other.id }, data: { maxStops: 0 } });
    await expect(rescheduleVisit(visit.id, '2026-03-04', { crewId: other.id })).rejects.toBeInstanceOf(CapacityExceeded);
  });
});
