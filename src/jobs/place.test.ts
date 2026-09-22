import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { ownerReport } from '../crews/report';
import { timesheetRows } from '../crews/timesheet';
import { crewDay } from '../crews/view';
import { prisma } from '../db';
import { propertySchedule } from '../portal/view';
import { routeFor } from '../routes/day';
import { makeAgreement, resetDb } from '../test/harness';
import { toDbDate } from '../time';
import { generateVisits } from '../visits/generate';
import { bookMakeUp, MakeUpRefused, skipOffers } from '../visits/makeup';
import { transition } from '../visits/status';
import { placeJob, PlacementRefused } from './place';

// Mon Mar 2 2026, noon in Tulsa.
const clock = fixedClock('2026-03-02T18:00:00Z');
const MON = '2026-03-02', TUE = '2026-03-03';

beforeEach(resetDb);

/** A crew-day with one agreement visit and one job visit at a different property. */
async function mixedDay() {
  const a = await makeAgreement('one_time', MON, { priceCents: 4500 });
  await generateVisits(clock, { date: MON });
  const other = await makeAgreement('one_time', '2026-06-01'); // only for its property and service type
  const { job, visit } = await placeJob(clock, {
    propertyId: other.propertyId, serviceTypeId: other.serviceTypeId, crewId: a.crewId, date: MON, priceCents: 12000, createdBy: 'Dana',
  });
  return { a, other, job, jobVisit: visit };
}

describe('placeJob', () => {
  it('creates the job and exactly one visit on the chosen crew-day, copying its property and service type', async () => {
    const { a, other, job, jobVisit } = await mixedDay();
    expect(jobVisit).toMatchObject({
      jobId: job.id, agreementId: null, crewId: a.crewId, date: toDbDate(MON),
      propertyId: other.propertyId, serviceTypeId: other.serviceTypeId, priceCents: 12000, status: 'pending',
    });
    expect(await prisma.visit.count({ where: { jobId: job.id } })).toBe(1);
  });

  it('is not capacity-checked: it can push a day past the crew limit', async () => {
    const a = await makeAgreement('one_time', MON);
    await prisma.crew.update({ where: { id: a.crewId }, data: { maxStops: 0 } });
    await expect(placeJob(clock, { propertyId: a.propertyId, serviceTypeId: a.serviceTypeId, crewId: a.crewId, date: MON, priceCents: 1, createdBy: 'Dana' }))
      .resolves.toBeTruthy();
  });

  it('refuses a past date, a non-date, and a negative price', async () => {
    const a = await makeAgreement('one_time', MON);
    const base = { propertyId: a.propertyId, serviceTypeId: a.serviceTypeId, crewId: a.crewId, date: MON, priceCents: 100, createdBy: 'Dana' };
    await expect(placeJob(clock, { ...base, date: '2026-03-01' })).rejects.toThrow(PlacementRefused);
    await expect(placeJob(clock, { ...base, date: '2026-02-30' })).rejects.toThrow(PlacementRefused);
    await expect(placeJob(clock, { ...base, priceCents: -1 })).rejects.toThrow(PlacementRefused);
    expect(await prisma.job.count()).toBe(0);
  });

  it('survives a horizon run: generation never touches a job visit', async () => {
    const { jobVisit } = await mixedDay();
    await generateVisits(clock, { date: MON });
    expect(await prisma.visit.findUnique({ where: { id: jobVisit.id } })).not.toBeNull();
  });
});

describe('a crew-day mixing agreement and job visits', () => {
  it('shows both on the route, the crew view, the portal, and the report; both reach the timesheet', async () => {
    const { a, other, jobVisit } = await mixedDay();
    const route = await routeFor(a.crewId, MON);
    expect(route.stops.map((s) => s.id)).toContain(jobVisit.id);
    expect(route.stops).toHaveLength(2);

    const crew = await crewDay(a.crewId, MON);
    expect(crew!.stops).toHaveLength(2);
    expect(JSON.stringify(crew)).not.toContain('12000');

    expect((await propertySchedule(other.propertyId, clock))!.visits.map((v) => v.id)).toEqual([jobVisit.id]);

    for (const s of route.stops) {
      await transition(s.id, a.crewId, { to: 'en_route' }, clock);
      clock.advance(30 * 60_000);
      await transition(s.id, a.crewId, { to: 'completed' }, clock);
    }
    const report = await ownerReport(MON);
    const row = report.crews.find((c) => c.id === a.crewId)!;
    expect(row).toMatchObject({ completed: 2, revenueCents: 16500 });
    expect((await timesheetRows(MON)).map((r) => r.address).sort())
      .toEqual(route.stops.map((s) => s.property.address).sort());
  });

  it('a skipped job visit gets a make-up that stays the job, and only once', async () => {
    const { job, jobVisit, a } = await mixedDay();
    await transition(jobVisit.id, a.crewId, { to: 'skipped', reason: 'locked_gate' }, clock);
    const skipped = await prisma.visit.findMany({ where: { id: jobVisit.id }, include: { serviceType: true } });
    expect((await skipOffers(a.crewId, skipped)).get(jobVisit.id)).toEqual({ booked: null, offer: TUE });

    const makeUp = await bookMakeUp(jobVisit.id, TUE);
    expect(makeUp).toMatchObject({ jobId: job.id, agreementId: null, priceCents: 12000, detached: true });
    await expect(bookMakeUp(jobVisit.id, TUE)).rejects.toThrow(MakeUpRefused);
    expect((await skipOffers(a.crewId, skipped)).get(jobVisit.id)).toEqual({ booked: TUE, offer: null });
  });
});

describe('the database', () => {
  it('refuses a visit with both origins or neither', async () => {
    const { a, jobVisit } = await mixedDay();
    await expect(prisma.visit.update({ where: { id: jobVisit.id }, data: { agreementId: a.id } })).rejects.toThrow();
    await expect(prisma.visit.update({ where: { id: jobVisit.id }, data: { jobId: null } })).rejects.toThrow();
  });

  it("refuses a visit whose property disagrees with its origin's, and an origin whose property changes", async () => {
    const { a, other, jobVisit } = await mixedDay();
    await expect(prisma.visit.update({ where: { id: jobVisit.id }, data: { propertyId: a.propertyId } })).rejects.toThrow(/does not match/);
    await expect(prisma.agreement.update({ where: { id: a.id }, data: { propertyId: other.propertyId } })).rejects.toThrow(/cannot change/);
    await expect(prisma.job.update({ where: { id: jobVisit.jobId! }, data: { serviceTypeId: a.serviceTypeId } })).rejects.toThrow(/cannot change/);
  });
});
