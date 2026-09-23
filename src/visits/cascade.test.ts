import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { CapacityExceeded } from '../crews/capacity';
import { prisma } from '../db';
import { makeAgreement, makeCrew, resetDb } from '../test/harness';
import { fromDbDate, toDbDate } from '../time';
import { CascadeRefused, commitAllCrews, commitCascade, nextServiceDay, previewAllCrews, previewCascade, resolveTarget } from './cascade';
import { generateVisits } from './generate';

// Mon Mar 2 2026, noon in Tulsa.
const clock = fixedClock('2026-03-02T18:00:00Z');
const MON = '2026-03-02', TUE = '2026-03-03', WED = '2026-03-04', FRI = '2026-03-06';

/** A crew with one-time visits on the given days, one agreement (and property) each. */
async function crewWith(days: string[]) {
  const crew = await makeCrew();
  for (const d of days) await makeAgreement('one_time', d, { crewId: crew.id });
  await generateVisits(clock, { date: MON });
  return crew;
}
const onDay = async (crewId: string, d: string) =>
  prisma.visit.findMany({ where: { crewId, date: toDbDate(d) }, orderBy: { id: 'asc' } });
const ids = (vs: { id: string }[]) => vs.map((v) => v.id);

beforeEach(resetDb);

describe('push targets', () => {
  it('next day is the calendar day; next service day skips the weekend', () => {
    expect(resolveTarget(FRI, 'next_day')).toBe('2026-03-07');
    expect(resolveTarget(FRI, 'next_service_day')).toBe('2026-03-09');
    expect(nextServiceDay('2026-03-07')).toBe('2026-03-09');
    expect(resolveTarget(MON, '2026-03-05')).toBe('2026-03-05');
    expect(() => resolveTarget(MON, '2026-02-30')).toThrow(CascadeRefused);
  });

  it('refuses a target that is not after the day, or already past', async () => {
    const crew = await makeCrew();
    await expect(previewCascade(clock, crew.id, TUE, MON)).rejects.toThrow(CascadeRefused);
    await expect(previewCascade(clock, crew.id, '2026-02-26', 'next_day')).rejects.toThrow(/past/);
  });
});

describe('rain day', () => {
  it('clean push: pending visits move, detach, lose their route position, and queue a notice each', async () => {
    const crew = await crewWith([FRI, FRI, FRI]);
    const [started, ...pending] = await onDay(crew.id, FRI);
    await prisma.visit.update({ where: { id: started!.id }, data: { status: 'en_route', startedAt: clock.now() } });
    await prisma.visit.updateMany({ where: { crewId: crew.id }, data: { routePosition: 1 } });

    const plan = await previewCascade(clock, crew.id, FRI, 'next_service_day');
    expect(plan.state).toBe('clean');
    expect(plan.to).toBe('2026-03-09');
    expect(ids(plan.staying)).toEqual([started!.id]);

    await commitCascade(clock, crew.id, FRI, 'next_service_day', {}, { expect: ids(pending) });
    const moved = await onDay(crew.id, '2026-03-09');
    expect(ids(moved)).toEqual(ids(pending));
    expect(moved.every((v) => v.detached && v.routePosition === null && fromDbDate(v.occurrenceDate) === FRI)).toBe(true);
    expect(ids(await onDay(crew.id, FRI))).toEqual([started!.id]);

    const notices = await prisma.notification.findMany();
    expect(notices.map((n) => n.visitId).sort()).toEqual(ids(pending).sort());
    expect(notices[0]!.body).toMatch(/moved from Fri, Mar 6 to Mon, Mar 9/);
    expect(notices[0]!.body).not.toMatch(/\$|45\.00|4500/);
  });

  it('collision: the same property already booked on the target shows both; pushing further clears it', async () => {
    const crew = await makeCrew();
    const a = await makeAgreement('one_time', MON, { crewId: crew.id });
    await makeAgreement('one_time', TUE, { crewId: crew.id, propertyId: a.propertyId });
    await generateVisits(clock, { date: MON });
    const [pushed] = await onDay(crew.id, MON);

    const plan = await previewCascade(clock, crew.id, MON, 'next_day');
    expect(plan.state).toBe('collision');
    expect(plan.moves[0]!.collisions).toHaveLength(1);

    const further = await previewCascade(clock, crew.id, MON, 'next_day', { [pushed!.id]: 'further' });
    expect(further.state).toBe('clean');
    expect(further.moves[0]!.date).toBe(WED);

    await commitCascade(clock, crew.id, MON, 'next_day', { [pushed!.id]: 'further' }, { expect: [pushed!.id] });
    expect(ids(await onDay(crew.id, WED))).toEqual([pushed!.id]);
  });

  it('overflow: refused without an override; with one, applied and logged per landed visit', async () => {
    const crew = await crewWith([MON, MON, TUE, TUE]);
    await prisma.crew.update({ where: { id: crew.id }, data: { maxStops: 3 } });
    const pushed = ids(await onDay(crew.id, MON));

    const plan = await previewCascade(clock, crew.id, MON, 'next_day');
    expect(plan.state).toBe('overflow');
    expect(plan.days[0]).toMatchObject({ date: TUE, over: true, load: { stops: 4, minutes: 120 } });

    await expect(commitCascade(clock, crew.id, MON, 'next_day', {}, { expect: pushed })).rejects.toThrow(CapacityExceeded);
    expect(ids(await onDay(crew.id, MON))).toEqual(pushed);

    await commitCascade(clock, crew.id, MON, 'next_day', {}, { expect: pushed, override: { reason: 'Rain; crew stays late', by: 'dispatcher' } });
    expect(await onDay(crew.id, MON)).toEqual([]);
    const logged = await prisma.capacityOverride.findMany();
    expect(logged.map((o) => o.visitId).sort()).toEqual([...pushed].sort());
    expect(logged[0]).toMatchObject({ stops: 4, reason: 'Rain; crew stays late' });
  });

  it('stale: a stop started after the preview refuses the whole push', async () => {
    const crew = await crewWith([MON, MON]);
    const plan = await previewCascade(clock, crew.id, MON, 'next_day');
    const seen = plan.moves.map((m) => m.visit.id);
    await prisma.visit.update({ where: { id: seen[0]! }, data: { status: 'en_route', startedAt: clock.now() } });

    await expect(commitCascade(clock, crew.id, MON, 'next_day', {}, { expect: seen })).rejects.toThrow(/changed since the preview/);
    expect(await onDay(crew.id, TUE)).toEqual([]);
  });
});

describe('failure injection: no partial application', () => {
  // A real database error raised mid-commit, after earlier statements in the transaction succeeded.
  async function failOn(table: string, when: string) {
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION inject_fault() RETURNS trigger AS $$
      BEGIN IF ${when} THEN RAISE EXCEPTION 'injected fault'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER inject_fault BEFORE INSERT OR UPDATE ON "${table}" FOR EACH ROW EXECUTE FUNCTION inject_fault()`);
  }
  afterEach(async () => {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS inject_fault ON "Visit"');
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS inject_fault ON "Notification"');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS inject_fault()');
  });

  const snapshot = async () => (await prisma.visit.findMany({ orderBy: { id: 'asc' } })).map((v) => [v.id, fromDbDate(v.date), v.detached]);

  it('the last visit update fails → no visit moved, no notice queued', async () => {
    const crew = await crewWith([MON, MON, MON, MON]);
    const plan = await previewCascade(clock, crew.id, MON, 'next_day');
    const seen = plan.moves.map((m) => m.visit.id);
    const before = await snapshot();
    await failOn('Visit', `NEW.id = '${seen.at(-1)}'`);

    await expect(commitCascade(clock, crew.id, MON, 'next_day', {}, { expect: seen })).rejects.toThrow(/injected fault/);
    expect(await snapshot()).toEqual(before);
    expect(await prisma.notification.count()).toBe(0);
  });

  it('the outbox insert fails after every move → every move rolls back', async () => {
    const crew = await crewWith([MON, MON, MON]);
    const seen = (await previewCascade(clock, crew.id, MON, 'next_day')).moves.map((m) => m.visit.id);
    const before = await snapshot();
    await failOn('Notification', 'true');

    await expect(commitCascade(clock, crew.id, MON, 'next_day', {}, { expect: seen })).rejects.toThrow(/injected fault/);
    expect(await snapshot()).toEqual(before);
  });

  it('zero lost visits: after a push and a regeneration every original visit is still there, once', async () => {
    const crew = await makeCrew();
    for (let i = 0; i < 6; i++) await makeAgreement('weekly', MON, { crewId: crew.id });
    await generateVisits(clock, { date: MON });
    const original = ids(await prisma.visit.findMany({ orderBy: { id: 'asc' } }));
    const seen = ids(await onDay(crew.id, MON));

    await commitCascade(clock, crew.id, MON, 'next_day', {}, { expect: seen });
    await generateVisits(clock, { date: MON });

    const after = await prisma.visit.findMany({ orderBy: { id: 'asc' } });
    expect(ids(after)).toEqual(original);
    expect(after.filter((v) => fromDbDate(v.date) === MON)).toEqual([]);
  });
});

describe('bulk rain day (PX-5)', () => {
  it('previews every crew with pending stops; one stale crew fails alone, the others commit', async () => {
    const a = await crewWith([FRI]), b = await crewWith([FRI, FRI]);
    await makeCrew(); // no stops: left out of the preview
    const rows = await previewAllCrews(clock, FRI, 'next_service_day');
    expect(rows.map((r) => r.crew.id).sort()).toEqual([a.id, b.id].sort());

    const expect_ = Object.fromEntries(rows.map((r) => [r.crew.id, ids(r.plan.moves.map((m) => m.visit))]));
    // Crew A's day changes after the preview.
    await makeAgreement('one_time', FRI, { crewId: a.id });
    await generateVisits(clock, { date: MON });

    const out = await commitAllCrews(clock, FRI, 'next_service_day', expect_);
    expect(out.find((o) => o.crewId === a.id)).toMatchObject({ moved: 0, error: expect.stringMatching(/changed/) });
    expect(out.find((o) => o.crewId === b.id)).toMatchObject({ moved: 2 });
    expect(await onDay(a.id, FRI)).toHaveLength(2);
    expect(await onDay(b.id, '2026-03-09')).toHaveLength(2);
  });
});
