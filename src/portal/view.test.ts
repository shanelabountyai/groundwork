import type { Visit } from '../generated/prisma/client';
import { beforeEach, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { prisma } from '../db';
import { makeAgreement, resetDb } from '../test/harness';
import { generateVisits } from '../visits/generate';
import { transition } from '../visits/status';
import { propertyHistory, propertyOwnsPhoto, propertySchedule } from './view';

beforeEach(resetDb);

it('shows only today-or-later, still-open visits, with price (unlike the crew view)', async () => {
  const a = await makeAgreement('weekly', '2026-03-03', { priceCents: 5500 });
  await generateVisits(fixedClock('2026-03-02T17:00:00Z'));

  const firstVisit = await prisma.visit.findFirstOrThrow({ where: { agreementId: a.id }, orderBy: { date: 'asc' } });
  await transition(firstVisit.id, a.crewId, { to: 'en_route' }, fixedClock('2026-03-03T15:00:00Z'));
  await transition(firstVisit.id, a.crewId, { to: 'completed' }, fixedClock('2026-03-03T16:00:00Z'));

  const schedule = await propertySchedule(a.propertyId, fixedClock('2026-03-05T12:00:00Z'));
  expect(schedule!.visits.length).toBeGreaterThan(0);
  for (const v of schedule!.visits) {
    expect(v.date >= '2026-03-05').toBe(true);
    expect(v.priceCents).toBe(5500);
    expect(v.status).not.toBe('completed');
  }
});

it('an unknown property is null, not an error page', async () => {
  expect(await propertySchedule('nope')).toBeNull();
});

const A = '11111111-1111-1111-1111-111111111111.jpg';
const B = '22222222-2222-2222-2222-222222222222.jpg';

it('history lists completed and skipped only, newest first, without the crew note', async () => {
  const a = await makeAgreement('weekly', '2026-03-03');
  await generateVisits(fixedClock('2026-03-02T17:00:00Z'));
  const [v1, v2, v3] = (await prisma.visit.findMany({ where: { agreementId: a.id }, orderBy: { date: 'asc' }, take: 3 })) as [Visit, Visit, Visit];
  await transition(v1.id, a.crewId, { to: 'en_route' }, fixedClock('2026-03-03T15:00:00Z'));
  await transition(v1.id, a.crewId, { to: 'completed' }, fixedClock('2026-03-03T16:00:00Z'));
  await transition(v2.id, a.crewId, { to: 'skipped', reason: 'locked_gate', note: 'internal gripe' }, fixedClock('2026-03-10T15:00:00Z'));
  await prisma.visit.update({ where: { id: v1.id }, data: { beforePhoto: `uploads/${A}`, afterPhoto: 'elsewhere/x.jpg' } });

  const h = await propertyHistory(a.propertyId);
  expect(h.map((x) => x.id)).toEqual([v2.id, v1.id]);
  expect(h.map((x) => x.id)).not.toContain(v3.id);
  expect(h[0]).toMatchObject({ status: 'skipped', skipReason: 'locked_gate' });
  expect(JSON.stringify(h)).not.toContain('internal gripe');
  expect(h[1]).toMatchObject({ before: A, after: null });
});

it("a property can only reach photos on its own visits", async () => {
  const a = await makeAgreement('weekly', '2026-03-03');
  const b = await makeAgreement('weekly', '2026-03-03');
  await generateVisits(fixedClock('2026-03-02T17:00:00Z'));
  const va = await prisma.visit.findFirstOrThrow({ where: { agreementId: a.id } });
  const vb = await prisma.visit.findFirstOrThrow({ where: { agreementId: b.id } });
  await prisma.visit.update({ where: { id: va.id }, data: { beforePhoto: `uploads/${A}` } });
  await prisma.visit.update({ where: { id: vb.id }, data: { afterPhoto: `uploads/${B}` } });

  expect(await propertyOwnsPhoto(a.propertyId, A)).toBe(true);
  expect(await propertyOwnsPhoto(a.propertyId, B)).toBe(false);
  expect(await propertyOwnsPhoto(b.propertyId, B)).toBe(true);
  expect(await propertyOwnsPhoto(a.propertyId, '33333333-3333-3333-3333-333333333333.jpg')).toBe(false);
});
