import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { prisma } from '../db';
import { makeAgreement, resetDb } from '../test/harness';
import { generateVisits } from './generate';
import { canTransition, customerSkip, IllegalTransition, transition } from './status';

const TODAY = '2026-03-03';
const clock = fixedClock('2026-03-03T15:00:00Z'); // 9am in Tulsa

async function visitToday() {
  const a = await makeAgreement('one_time', TODAY);
  await generateVisits(fixedClock('2026-03-02T17:00:00Z'));
  return prisma.visit.findFirstOrThrow({ where: { agreementId: a.id } });
}

beforeEach(resetDb);

describe('visit status machine', () => {
  it('allows only pending → en_route → completed, and skip from either open state', () => {
    expect(canTransition('pending', 'en_route')).toBe(true);
    expect(canTransition('pending', 'skipped')).toBe(true);
    expect(canTransition('en_route', 'completed')).toBe(true);
    expect(canTransition('en_route', 'skipped')).toBe(true);
    expect(canTransition('pending', 'completed')).toBe(false);
    expect(canTransition('en_route', 'pending')).toBe(false);
    expect(canTransition('completed', 'skipped')).toBe(false);
    expect(canTransition('skipped', 'en_route')).toBe(false);
  });

  it('start then complete stamps times, note and photos', async () => {
    const v = await visitToday();
    await transition(v.id, v.crewId, { to: 'en_route' }, clock);
    const done = await transition(v.id, v.crewId, { to: 'completed', note: ' Trimmed the bed ', beforePhoto: 'uploads/a.jpg', afterPhoto: 'uploads/b.jpg' }, clock);
    expect(done).toMatchObject({ status: 'completed', note: 'Trimmed the bed', beforePhoto: 'uploads/a.jpg', afterPhoto: 'uploads/b.jpg' });
    expect(done.startedAt).toEqual(clock.now());
    expect(done.finishedAt).toEqual(clock.now());
  });

  it('refuses completing a stop that was never started', async () => {
    const v = await visitToday();
    await expect(transition(v.id, v.crewId, { to: 'completed' }, clock)).rejects.toThrow(IllegalTransition);
  });

  it('a skip needs a reason, and "other" needs a note', async () => {
    const v = await visitToday();
    await expect(transition(v.id, v.crewId, { to: 'skipped', reason: 'other', note: '  ' }, clock)).rejects.toThrow(/note/);
    const s = await transition(v.id, v.crewId, { to: 'skipped', reason: 'dog_loose' }, clock);
    expect(s).toMatchObject({ status: 'skipped', skipReason: 'dog_loose', startedAt: null });
  });

  it('closed is final', async () => {
    const v = await visitToday();
    await transition(v.id, v.crewId, { to: 'skipped', reason: 'locked_gate' }, clock);
    await expect(transition(v.id, v.crewId, { to: 'en_route' }, clock)).rejects.toThrow(IllegalTransition);
  });

  it("a crew can act only on its own stops, and only today's", async () => {
    const v = await visitToday();
    await expect(transition(v.id, 'someone-else', { to: 'en_route' }, clock)).rejects.toThrow(IllegalTransition);
    await expect(transition(v.id, v.crewId, { to: 'en_route' }, fixedClock('2026-03-04T15:00:00Z'))).rejects.toThrow(IllegalTransition);
  });

  it('two taps racing on the same stop: exactly one wins', async () => {
    const v = await visitToday();
    const results = await Promise.allSettled([
      transition(v.id, v.crewId, { to: 'en_route' }, clock),
      transition(v.id, v.crewId, { to: 'skipped', reason: 'weather' }, clock),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('the database refuses a skip without a reason, whoever writes it', async () => {
    const v = await visitToday();
    await expect(prisma.visit.update({ where: { id: v.id }, data: { status: 'skipped', finishedAt: clock.now() } })).rejects.toThrow();
  });

  it('en_route notifies by default, and not when the property opts out', async () => {
    const v = await visitToday();
    await transition(v.id, v.crewId, { to: 'en_route' }, clock);
    expect(await prisma.notification.findMany({ where: { visitId: v.id } })).toHaveLength(1);

    const property = await prisma.property.create({
      data: { address: 'Quiet House, Tulsa OK', lat: 36.1, lng: -95.9, customerName: 'Quiet Customer', customerPhone: '555-0199', notifyOnEnRoute: false },
    });
    const v2 = await (async () => {
      const a = await makeAgreement('one_time', TODAY, { propertyId: property.id });
      await generateVisits(fixedClock('2026-03-02T17:00:00Z'));
      return prisma.visit.findFirstOrThrow({ where: { agreementId: a.id } });
    })();
    await transition(v2.id, v2.crewId, { to: 'en_route' }, clock);
    expect(await prisma.notification.findMany({ where: { visitId: v2.id } })).toHaveLength(0);
  });
});

const propertyIdOf = (visit: { propertyId: string }) => visit.propertyId;

describe('customerSkip', () => {
  it('cancels a pending stop for its own property, with reason customer_request', async () => {
    const v = await visitToday();
    const done = await customerSkip(v.id, await propertyIdOf(v), clock);
    expect(done).toMatchObject({ status: 'skipped', skipReason: 'customer_request', startedAt: null });
    expect(done.finishedAt).toEqual(clock.now());
  });

  it('refuses another property\'s stop, same message as "not found"', async () => {
    const v = await visitToday();
    await expect(customerSkip(v.id, 'someone-elses-property', clock)).rejects.toThrow(IllegalTransition);
    await expect(customerSkip('no-such-visit', await propertyIdOf(v), clock)).rejects.toThrow(IllegalTransition);
  });

  it('refuses once a crew is already en route — the customer can only cancel ahead of that', async () => {
    const v = await visitToday();
    await transition(v.id, v.crewId, { to: 'en_route' }, clock);
    await expect(customerSkip(v.id, await propertyIdOf(v), clock)).rejects.toThrow(IllegalTransition);
  });

  it('two cancels racing on the same stop: exactly one wins', async () => {
    const v = await visitToday();
    const propertyId = await propertyIdOf(v);
    const results = await Promise.allSettled([
      customerSkip(v.id, propertyId, clock),
      customerSkip(v.id, propertyId, clock),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});
