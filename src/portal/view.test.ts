import { beforeEach, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { prisma } from '../db';
import { makeAgreement, resetDb } from '../test/harness';
import { generateVisits } from '../visits/generate';
import { transition } from '../visits/status';
import { propertySchedule } from './view';

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
