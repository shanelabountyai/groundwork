import { prisma, type Tx } from './db';

/** Refused: the change would leave nobody able to sign in to the dispatch desk. */
export class LastDispatcher extends Error {
  constructor() { super('That is the last dispatcher — add another before changing or removing this one'); }
}

/**
 * Runs `change` in a transaction that first locks every dispatcher row, so two
 * concurrent demotions serialize and the second sees the first. Throws
 * `LastDispatcher` unless another dispatcher remains once `id` stops being one.
 */
export async function withoutDispatcher<T>(id: string, change: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE role = 'dispatcher' FOR UPDATE`;
    if (locked.some((u) => u.id === id) && !locked.some((u) => u.id !== id)) throw new LastDispatcher();
    return change(tx);
  });
}
