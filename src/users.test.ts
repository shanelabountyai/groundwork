import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './db';
import { makeCrew, resetDb } from './test/harness';
import { LastDispatcher, withoutDispatcher } from './users';

beforeEach(resetDb);

const dispatcher = (name: string) => prisma.user.create({ data: { name, role: 'dispatcher', email: `${name}@x.test` } });

describe('withoutDispatcher', () => {
  it('refuses to demote or delete the only dispatcher, and runs the change once another exists', async () => {
    const dana = await dispatcher('dana');
    const crew = await makeCrew();
    await expect(withoutDispatcher(dana.id, (tx) => tx.user.delete({ where: { id: dana.id } }))).rejects.toBeInstanceOf(LastDispatcher);
    await expect(withoutDispatcher(dana.id, (tx) => tx.user.update({ where: { id: dana.id }, data: { role: 'crew', crewId: crew.id } }))).rejects.toBeInstanceOf(LastDispatcher);
    expect(await prisma.user.count()).toBe(1);

    const sam = await dispatcher('sam');
    await withoutDispatcher(dana.id, (tx) => tx.user.delete({ where: { id: dana.id } }));
    expect((await prisma.user.findMany()).map((u) => u.id)).toEqual([sam.id]);
  });

  it('serializes two concurrent demotions so one dispatcher always remains', async () => {
    const [a, b] = [await dispatcher('a'), await dispatcher('b')];
    const results = await Promise.allSettled([a, b].map((u) => withoutDispatcher(u.id, (tx) => tx.user.delete({ where: { id: u.id } }))));
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await prisma.user.count()).toBe(1);
  });
});
