import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { makeCrew, resetDb } from '../test/harness';
import { toDbDate } from '../time';

beforeEach(resetDb);

// K13: the override log is append-only in the database, not just by convention.
describe('CapacityOverride log', () => {
  async function logged() {
    const crew = await makeCrew();
    return prisma.capacityOverride.create({
      data: { crewId: crew.id, date: toDbDate('2026-03-03'), visitId: 'v1', stops: 3, minutes: 90, reason: 'storm cleanup', by: 'Dana' },
    });
  }

  it('takes new rows', async () => {
    await logged();
    expect(await prisma.capacityOverride.count()).toBe(1);
  });

  it('refuses an update or delete, so a logged override cannot be rewritten or erased', async () => {
    const row = await logged();
    await expect(prisma.capacityOverride.update({ where: { id: row.id }, data: { reason: 'nothing to see' } })).rejects.toThrow(/append-only/);
    await expect(prisma.capacityOverride.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`DELETE FROM "CapacityOverride"`).rejects.toThrow(/append-only/);
    expect(await prisma.capacityOverride.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ reason: 'storm cleanup', by: 'Dana' });
  });

  it('still empties on a test reset (TRUNCATE)', async () => {
    await logged();
    await resetDb();
    expect(await prisma.capacityOverride.count()).toBe(0);
  });
});
