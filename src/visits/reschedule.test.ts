import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { prisma } from '../db';
import { makeAgreement, makeCrew, resetDb } from '../test/harness';
import { toDbDate } from '../time';
import { generateVisits } from './generate';
import { approveReschedule, decidedRequests, declineReschedule, fitsOn, fullDays, RescheduleRefused, requestReschedule, ReviewRefused } from './reschedule';
import { MakeUpRefused } from './makeup';
import { propertySchedule } from '../portal/view';
import { IllegalTransition } from './status';

// Mon Mar 2 2026, noon in Tulsa.
const clock = fixedClock('2026-03-02T18:00:00Z');
const MON = '2026-03-02', TUE = '2026-03-03', WED = '2026-03-04', SAT = '2026-03-07';

/** Two customers on one crew: `mine` on Monday, and `other` on Tuesday. */
async function setup() {
  const crew = await makeCrew();
  const a = await makeAgreement('one_time', MON, { crewId: crew.id, priceCents: 7700 });
  await makeAgreement('one_time', TUE, { crewId: crew.id });
  await generateVisits(clock, { date: MON });
  const mine = await prisma.visit.findFirstOrThrow({ where: { agreementId: a.id } });
  return { crew, mine };
}
const onDay = (crewId: string, d: string) => prisma.visit.findMany({ where: { crewId, date: toDbDate(d), status: { not: 'skipped' } } });

beforeEach(resetDb);

describe('fullDays', () => {
  it('marks exactly the days fitsOn refuses, from one window query', async () => {
    const { crew, mine } = await setup();
    await prisma.crew.update({ where: { id: crew.id }, data: { maxStops: 1 } });
    const full = await fullDays(mine.id, clock);
    expect(full.has(TUE)).toBe(true);
    expect(full.has(WED)).toBe(false);
    expect(full.has(TUE)).toBe(!(await fitsOn(mine.id, TUE)));
  });
});

describe('requestReschedule', () => {
  it('books an open day at once: original skipped, new visit keeps the price and detaches', async () => {
    const { crew, mine } = await setup();
    expect(await fitsOn(mine.id, WED)).toBe(true);
    expect(await requestReschedule(mine.id, mine.propertyId, WED, clock)).toBe('booked');

    const was = await prisma.visit.findUniqueOrThrow({ where: { id: mine.id } });
    expect(was).toMatchObject({ status: 'skipped', skipReason: 'customer_request' });
    const [moved] = await onDay(crew.id, WED);
    expect(moved).toMatchObject({ priceCents: 7700, detached: true, propertyId: mine.propertyId });
    expect(await prisma.rescheduleRequest.count()).toBe(0);
  });

  it('queues a full day instead of overbooking it; approve books it over capacity, logged', async () => {
    const { crew, mine } = await setup();
    await prisma.crew.update({ where: { id: crew.id }, data: { maxStops: 1 } });
    expect(await fitsOn(mine.id, TUE)).toBe(false);
    expect(await requestReschedule(mine.id, mine.propertyId, TUE, clock)).toBe('requested');
    expect(await onDay(crew.id, TUE)).toHaveLength(1);

    const req = await prisma.rescheduleRequest.findFirstOrThrow();
    const booked = await approveReschedule(req.id, 'Dana');
    expect(booked.priceCents).toBe(7700);
    expect(await onDay(crew.id, TUE)).toHaveLength(2);
    expect(await prisma.rescheduleRequest.findUniqueOrThrow({ where: { id: req.id } })).toMatchObject({ status: 'approved', decidedBy: 'Dana' });
    expect(await prisma.capacityOverride.findFirstOrThrow()).toMatchObject({ by: 'Dana', visitId: booked.id });
    await expect(approveReschedule(req.id, 'Dana')).rejects.toThrow(); // already resolved: no second booking
    expect(await onDay(crew.id, TUE)).toHaveLength(2);
  });

  it('decline needs a reason and leaves the skip with no make-up', async () => {
    const { crew, mine } = await setup();
    await prisma.crew.update({ where: { id: crew.id }, data: { maxStops: 1 } });
    await requestReschedule(mine.id, mine.propertyId, TUE, clock);
    const req = await prisma.rescheduleRequest.findFirstOrThrow();
    await expect(declineReschedule(req.id, '  ', 'Dana')).rejects.toBeInstanceOf(ReviewRefused);
    await declineReschedule(req.id, 'Crew is out that day', 'Dana');
    expect(await prisma.rescheduleRequest.findUniqueOrThrow({ where: { id: req.id } })).toMatchObject({ status: 'declined', note: 'Crew is out that day', decidedBy: 'Dana' });
    expect((await decidedRequests()).map((r) => r.id)).toEqual([req.id]);
    expect(await onDay(crew.id, TUE)).toHaveLength(1);
    const n = await prisma.notification.findFirstOrThrow({ where: { visitId: mine.id }, orderBy: { createdAt: 'desc' } });
    expect(n.body).toContain('Crew is out that day');
    expect(n.sentAt).toBeNull();
  });

  it('a declined customer can pick another day: no second skip, price kept, the declined card goes away', async () => {
    const { crew, mine } = await setup();
    await prisma.crew.update({ where: { id: crew.id }, data: { maxStops: 1 } });
    await requestReschedule(mine.id, mine.propertyId, TUE, clock);
    await declineReschedule((await prisma.rescheduleRequest.findFirstOrThrow()).id, 'Crew is out', 'Dana');
    expect((await propertySchedule(mine.propertyId, clock))!.requests).toMatchObject([{ status: 'declined', visitId: mine.id }]);
    expect(await requestReschedule(mine.id, mine.propertyId, WED, clock)).toBe('booked');
    expect((await onDay(crew.id, WED))[0]!.priceCents).toBe(7700);
    expect((await propertySchedule(mine.propertyId, clock))!.requests).toEqual([]);
    await expect(requestReschedule(mine.id, mine.propertyId, '2026-03-05', clock)).rejects.toBeInstanceOf(MakeUpRefused); // one make-up only
  });

  it('a retry that is full again queues a new request, and only that one shows', async () => {
    const { crew, mine } = await setup();
    await prisma.crew.update({ where: { id: crew.id }, data: { maxStops: 1 } });
    await requestReschedule(mine.id, mine.propertyId, TUE, clock);
    await declineReschedule((await prisma.rescheduleRequest.findFirstOrThrow()).id, 'Crew is out', 'Dana');
    expect(await requestReschedule(mine.id, mine.propertyId, TUE, clock)).toBe('requested');
    expect((await propertySchedule(mine.propertyId, clock))!.requests).toMatchObject([{ status: 'pending' }]);
    await expect(requestReschedule(mine.id, mine.propertyId, WED, clock)).rejects.toBeInstanceOf(IllegalTransition); // pending: no retry
  });

  it('refuses a weekend, a past day, and a day beyond 60, leaving the visit pending', async () => {
    const { mine } = await setup();
    for (const d of [SAT, MON, '2026-01-05', '2026-06-01', 'nope']) {
      await expect(requestReschedule(mine.id, mine.propertyId, d, clock)).rejects.toBeInstanceOf(RescheduleRefused);
    }
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe('pending');
  });

  it('a booking that fails for a reason other than capacity leaves the visit pending', async () => {
    const { crew, mine } = await setup();
    // A make-up already sits in this visit's slot (occurrence + 1), so the booking is refused.
    await prisma.visit.create({
      data: { agreementId: mine.agreementId, propertyId: mine.propertyId, serviceTypeId: mine.serviceTypeId, crewId: crew.id, occurrenceDate: toDbDate(TUE), date: toDbDate(WED), priceCents: 1, detached: true },
    });
    await expect(requestReschedule(mine.id, mine.propertyId, WED, clock)).rejects.toBeInstanceOf(MakeUpRefused);
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe('pending');
    expect(await prisma.rescheduleRequest.count()).toBe(0);
  });

  it("won't move another property's visit", async () => {
    const { mine } = await setup();
    const other = await makeAgreement('one_time', TUE);
    await expect(requestReschedule(mine.id, other.propertyId, WED, clock)).rejects.toBeInstanceOf(IllegalTransition);
  });
});
