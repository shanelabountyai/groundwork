import { beforeEach, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { prisma } from '../db';
import { makeAgreement, makeCrew, resetDb } from '../test/harness';
import { toDbDate } from '../time';
import { generateVisits } from '../visits/generate';
import { weekBoard } from './board';

beforeEach(resetDb);

it('cell totals match a hand tally: skips excluded from load, levels by the tighter limit', async () => {
  const crew = await makeCrew('Tally'); // 12 stops, 480 min; harness visits are 30 min each
  await prisma.crew.update({ where: { id: crew.id }, data: { maxStops: 4 } });
  // Mon: 5 visits (over, 5/4). Tue: 3 visits, one skipped → 2 (light, 2/4). Wed: 4 (full, 4/4).
  for (const [d, n] of [['2026-03-02', 5], ['2026-03-03', 3], ['2026-03-04', 4]] as const) {
    for (let i = 0; i < n; i++) await makeAgreement('one_time', d, { crewId: crew.id });
  }
  await generateVisits(fixedClock('2026-03-02T18:00:00Z'), { date: '2026-03-02' });
  const tue = await prisma.visit.findFirstOrThrow({ where: { date: toDbDate('2026-03-03') } });
  await prisma.visit.update({ where: { id: tue.id }, data: { status: 'skipped', skipReason: 'weather', startedAt: null, finishedAt: new Date('2026-03-03T15:00:00Z') } });

  const board = await weekBoard('2026-03-02');
  expect(board.days).toHaveLength(7);
  const cells = board.crews[0]!.cells.map((c) => [c.stops, c.minutes, c.skipped, c.level]);
  expect(cells.slice(0, 4)).toEqual([[5, 150, 0, 'over'], [2, 60, 1, 'light'], [4, 120, 0, 'full'], [0, 0, 0, 'empty']]);
});
