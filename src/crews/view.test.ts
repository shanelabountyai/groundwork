import { beforeEach, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { makeAgreement, resetDb } from '../test/harness';
import { generateVisits } from '../visits/generate';
import { crewDay } from './view';

beforeEach(resetDb);

it('the crew day carries the stop and its access notes, and no price anywhere', async () => {
  const a = await makeAgreement('one_time', '2026-03-03', { priceCents: 98765 });
  await generateVisits(fixedClock('2026-03-02T17:00:00Z'));
  const day = await crewDay(a.crewId, '2026-03-03');
  expect(day!.stops).toHaveLength(1);
  expect(day!.stops[0]).toHaveProperty('accessNotes');
  const wire = JSON.stringify(day);
  expect(wire).not.toMatch(/price/i);
  expect(wire).not.toContain('98765');
});

it('an unknown crew is null, not an error page', async () => {
  expect(await crewDay('nope', '2026-03-03')).toBeNull();
});
