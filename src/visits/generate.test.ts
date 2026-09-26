import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { prisma } from '../db';
import { makeAgreement, makeCrew, resetDb } from '../test/harness';
import { fromDbDate, toDbDate } from '../time';
import { createAgreement, editAgreement, generateVisits, rescheduleVisit } from './generate';

const dates = async (agreementId: string) =>
  (await prisma.visit.findMany({ where: { agreementId }, orderBy: { occurrenceDate: 'asc' } })).map((v) => ({
    slot: fromDbDate(v.occurrenceDate), date: fromDbDate(v.date), status: v.status,
  }));
const slots = async (agreementId: string) => (await dates(agreementId)).map((v) => v.slot);

// Noon in Tulsa, so the local date is unambiguous.
const at = (d: string) => fixedClock(`${d}T17:00:00Z`);

beforeEach(resetDb);

describe('capacity warning', () => {
  it('generation and a crew change create every visit but report the crew-days left over capacity', async () => {
    const crew = await makeCrew();
    await prisma.crew.update({ where: { id: crew.id }, data: { maxStops: 1 } });
    await makeAgreement('one_time', '2026-03-02', { crewId: crew.id });
    await makeAgreement('one_time', '2026-03-02', { crewId: crew.id });
    const r = await generateVisits(at('2026-03-02'), { date: '2026-03-02' });
    expect(r.created).toBe(2);
    expect(r.overloaded).toEqual([{ crewId: crew.id, date: '2026-03-02', stops: 2, minutes: expect.any(Number) }]);
    expect((await generateVisits(at('2026-03-02'), { date: '2026-03-02' })).overloaded).toEqual([]); // nothing new placed, nothing to warn about

    const other = await makeCrew();
    await prisma.crew.update({ where: { id: other.id }, data: { maxStops: 1 } });
    await makeAgreement('one_time', '2026-03-02', { crewId: other.id });
    await generateVisits(at('2026-03-02'), { date: '2026-03-02' });
    const mine = await prisma.agreement.findFirstOrThrow({ where: { crewId: crew.id } });
    const e = await editAgreement(at('2026-03-02'), mine.id, { crewId: other.id });
    expect(e.overloaded).toMatchObject([{ crewId: other.id, date: '2026-03-02', stops: 2 }]);
    expect(await prisma.visit.count({ where: { crewId: other.id } })).toBe(2);
  });
});

describe('visits:generate', () => {
  it('biweekly from Mon Mar 2 → Mar 2, 16, 30; re-running creates zero duplicates', async () => {
    const a = await makeAgreement('biweekly', '2026-03-02');
    const first = await generateVisits(at('2026-03-02'));
    expect(first.created).toBe(3);
    expect(await slots(a.id)).toEqual(['2026-03-02', '2026-03-16', '2026-03-30']);

    const again = await generateVisits(at('2026-03-02'));
    expect(again).toMatchObject({ created: 0, withdrawn: 0 });
    expect(await prisma.visit.count()).toBe(3);
  });

  it('a rescheduled visit is never resurrected on its original date', async () => {
    const a = await makeAgreement('biweekly', '2026-03-02');
    await generateVisits(at('2026-03-02'));
    const mar16 = await prisma.visit.findFirstOrThrow({ where: { agreementId: a.id, occurrenceDate: toDbDate('2026-03-16') } });
    await rescheduleVisit(mar16.id, '2026-03-18');

    for (const day of ['2026-03-03', '2026-03-10', '2026-03-17']) await generateVisits(at(day));

    const all = await dates(a.id);
    expect(all.filter((v) => v.date === '2026-03-16')).toEqual([]);
    expect(all.find((v) => v.slot === '2026-03-16')?.date).toBe('2026-03-18');
  });

  it('a frequency edit regenerates only future, unstarted visits', async () => {
    const a = await makeAgreement('weekly', '2026-03-02');
    await generateVisits(at('2026-03-02'));
    await prisma.visit.updateMany({ where: { agreementId: a.id, occurrenceDate: toDbDate('2026-03-02') }, data: { status: 'completed', startedAt: new Date('2026-03-02T15:00:00Z'), finishedAt: new Date('2026-03-02T16:00:00Z') } });

    await editAgreement(at('2026-03-05'), a.id, { frequency: 'biweekly' });

    expect(await dates(a.id)).toEqual([
      { slot: '2026-03-02', date: '2026-03-02', status: 'completed' },
      { slot: '2026-03-16', date: '2026-03-16', status: 'pending' },
      { slot: '2026-03-30', date: '2026-03-30', status: 'pending' },
    ]);
  });

  it('pause withdraws the future and generates nothing; resume brings it back', async () => {
    const a = await makeAgreement('weekly', '2026-03-02');
    await generateVisits(at('2026-03-02'));

    await editAgreement(at('2026-03-10'), a.id, { paused: true });
    await generateVisits(at('2026-03-10'));
    expect(await slots(a.id)).toEqual(['2026-03-02', '2026-03-09']);

    await editAgreement(at('2026-03-20'), a.id, { paused: false });
    expect(await slots(a.id)).toEqual(['2026-03-02', '2026-03-09', '2026-03-23', '2026-03-30', '2026-04-06', '2026-04-13']);
  });

  it('crew and price edits follow future pending visits, never history', async () => {
    const a = await makeAgreement('weekly', '2026-03-02', { priceCents: 4500 });
    await generateVisits(at('2026-03-02'));
    await prisma.visit.updateMany({ where: { agreementId: a.id, occurrenceDate: toDbDate('2026-03-02') }, data: { status: 'completed', startedAt: new Date('2026-03-02T15:00:00Z'), finishedAt: new Date('2026-03-02T16:00:00Z') } });
    const crew = await makeCrew('Night shift');

    await editAgreement(at('2026-03-05'), a.id, { crewId: crew.id, priceCents: 5000 });

    const visits = await prisma.visit.findMany({ where: { agreementId: a.id }, orderBy: { date: 'asc' } });
    expect(visits[0]).toMatchObject({ status: 'completed', priceCents: 4500, crewId: a.crewId });
    expect(visits.slice(1).every((v) => v.crewId === crew.id && v.priceCents === 5000)).toBe(true);
  });

  it('BO-2: creating an agreement generates its visits immediately, no separate run needed', async () => {
    const crew = await makeCrew();
    const serviceType = await prisma.serviceType.create({ data: { name: 'Mow', estimatedMinutes: 30 } });
    const property = await prisma.property.create({ data: { address: '1 Test St', lat: 36.1, lng: -95.9, customerName: 'Jo', customerPhone: '555-0100' } });

    const { agreement, created } = await createAgreement(at('2026-03-02'), {
      propertyId: property.id, serviceTypeId: serviceType.id, crewId: crew.id, frequency: 'weekly', priceCents: 5000, startDate: '2026-03-02',
    });

    expect(created).toBe(5);
    expect(await slots(agreement.id)).toEqual(['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30']);
  });

  it('refuses swapped coordinates at the database', async () => {
    await expect(
      prisma.crew.create({ data: { name: 'Swapped', homeLat: -95.993, homeLng: 36.154, maxStops: 1, maxMinutes: 1 } }),
    ).rejects.toThrow();
  });
});
