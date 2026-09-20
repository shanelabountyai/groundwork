import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { CapacityExceeded } from '../crews/capacity';
import { prisma } from '../db';
import { makeAgreement, makeCrew, resetDb } from '../test/harness';
import { fromDbDate, toDbDate } from '../time';
import { generateVisits } from './generate';
import { bookMakeUp, MakeUpRefused, offerSlot, skipOffers } from './makeup';

// Mon Mar 2 2026, noon in Tulsa. Harness crews are 12 stops / 480 min, 30 min a visit.
const clock = fixedClock('2026-03-02T18:00:00Z');
const MON = '2026-03-02', TUE = '2026-03-03', FRI = '2026-03-06';

/** A crew with one-time visits on the given days, one agreement (and property) each. */
async function crewWith(days: string[]) {
  const crew = await makeCrew();
  for (const d of days) await makeAgreement('one_time', d, { crewId: crew.id });
  await generateVisits(clock, { date: MON });
  return crew;
}

const skip = (id: string) =>
  prisma.visit.update({
    where: { id },
    data: { status: 'skipped', skipReason: 'locked_gate', finishedAt: clock.now() },
  });

const firstOn = async (crewId: string, d: string) =>
  prisma.visit.findFirstOrThrow({ where: { crewId, date: toDbDate(d) }, orderBy: { id: 'asc' } });

beforeEach(resetDb);

describe('offerSlot', () => {
  it('offers the next service day, skipping the weekend', async () => {
    const crew = await crewWith([MON]);
    expect(await offerSlot(crew.id, MON, 30)).toBe(TUE);
    expect(await offerSlot(crew.id, FRI, 30)).toBe('2026-03-09');
  });

  it('steps past a day the visit would push over capacity, and gives up at the horizon', async () => {
    const crew = await crewWith(Array.from({ length: 12 }, () => TUE));
    expect(await offerSlot(crew.id, MON, 30)).toBe('2026-03-04');

    // Every service day inside the horizon full: no offer rather than a silent overload.
    await prisma.visit.updateMany({ where: { crewId: crew.id }, data: { date: toDbDate(TUE) } });
    for (const d of ['2026-03-04', '2026-03-05', FRI, '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-16']) {
      for (let i = 0; i < 12; i++) await makeAgreement('one_time', d, { crewId: crew.id });
    }
    await generateVisits(clock, { date: MON });
    expect(await offerSlot(crew.id, MON, 30)).toBeNull();
  });

  it('ignores skipped visits, which no longer hold a slot', async () => {
    const crew = await crewWith(Array.from({ length: 12 }, () => TUE));
    const full = await prisma.visit.findMany({ where: { crewId: crew.id } });
    expect(await offerSlot(crew.id, MON, 30)).toBe('2026-03-04');
    await skip(full[0]!.id);
    expect(await offerSlot(crew.id, MON, 30)).toBe(TUE);
  });
});

describe('bookMakeUp', () => {
  it('books a detached visit at the skipped price, keeps the skip, and queues a notice', async () => {
    const crew = await crewWith([MON]);
    const visit = await firstOn(crew.id, MON);
    await skip(visit.id);

    const offer = await offerSlot(crew.id, MON, 30);
    const made = await bookMakeUp(visit.id, offer!);

    expect(fromDbDate(made.date)).toBe(TUE);
    expect(made.status).toBe('pending');
    expect(made.detached).toBe(true);
    expect(made.priceCents).toBe(visit.priceCents);
    // The slot is the skipped occurrence plus a day: a week-or-longer pattern never produces it.
    expect(fromDbDate(made.occurrenceDate)).toBe('2026-03-03');

    const kept = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(kept.status).toBe('skipped');
    expect(kept.skipReason).toBe('locked_gate');

    const notice = await prisma.notification.findFirstOrThrow({ where: { visitId: made.id } });
    expect(notice.body).toMatch(/we'll be back/);
  });

  it('a horizon run leaves the make-up alone and does not refill the skipped slot', async () => {
    const crew = await crewWith([MON]);
    const visit = await firstOn(crew.id, MON);
    await skip(visit.id);
    const made = await bookMakeUp(visit.id, TUE);

    await generateVisits(clock, { date: MON });
    const all = await prisma.visit.findMany({ where: { agreementId: visit.agreementId } });
    expect(all.map((v) => v.id).sort()).toEqual([visit.id, made.id].sort());
  });

  it('refuses a second make-up, a stop that was not skipped, and a day before the skip', async () => {
    const crew = await crewWith([MON]);
    const visit = await firstOn(crew.id, MON);
    await expect(bookMakeUp(visit.id, TUE)).rejects.toBeInstanceOf(MakeUpRefused);

    await skip(visit.id);
    await bookMakeUp(visit.id, TUE);
    await expect(bookMakeUp(visit.id, '2026-03-04')).rejects.toThrow(/already booked/);
    await expect(bookMakeUp(visit.id, MON)).rejects.toThrow(/after the day/);
    await expect(bookMakeUp(visit.id, 'tuesday')).rejects.toThrow(/Not a date/);
  });

  it('refuses a day that filled up since the offer was rendered, leaving nothing behind', async () => {
    const crew = await crewWith([MON]);
    const visit = await firstOn(crew.id, MON);
    await skip(visit.id);
    const offer = await offerSlot(crew.id, MON, 30);

    for (let i = 0; i < 12; i++) await makeAgreement('one_time', TUE, { crewId: crew.id });
    await generateVisits(clock, { date: MON });

    await expect(bookMakeUp(visit.id, offer!)).rejects.toBeInstanceOf(CapacityExceeded);
    expect(await prisma.visit.count({ where: { agreementId: visit.agreementId } })).toBe(1);
  });
});

describe('skipOffers', () => {
  it('offers an unbooked skip and reports the booked day for one already made up', async () => {
    const crew = await crewWith([MON, MON]);
    const [a, b] = await prisma.visit.findMany({ where: { crewId: crew.id }, orderBy: { id: 'asc' } });
    await skip(a!.id);
    await skip(b!.id);
    await bookMakeUp(b!.id, TUE);

    const stops = await prisma.visit.findMany({
      where: { crewId: crew.id, date: toDbDate(MON), status: 'skipped' },
      include: { agreement: { include: { serviceType: true } } },
    });
    const offers = await skipOffers(crew.id, stops);
    expect(offers.get(a!.id)).toEqual({ booked: null, offer: TUE });
    expect(offers.get(b!.id)).toEqual({ booked: TUE, offer: null });
  });
});
