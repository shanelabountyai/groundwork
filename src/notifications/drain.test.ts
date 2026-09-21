import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { prisma } from '../db';
import { makeAgreement, resetDb } from '../test/harness';
import { generateVisits } from '../visits/generate';
import { drainOutbox } from './drain';

beforeEach(resetDb);

describe('outbox drain', () => {
  it('sends unsent rows, stamps sentAt, and leaves already-sent rows alone', async () => {
    const a = await makeAgreement('one_time', '2026-03-03');
    await generateVisits(fixedClock('2026-03-02T17:00:00Z'));
    const visit = await prisma.visit.findFirstOrThrow({ where: { agreementId: a.id } });
    await prisma.notification.create({ data: { visitId: visit.id, channel: 'sms', to: '555-0100', body: 'test' } });
    const already = await prisma.notification.create({
      data: { visitId: visit.id, channel: 'sms', to: '555-0100', body: 'old', sentAt: new Date('2026-01-01') },
    });

    const sent: string[] = [];
    const clock = fixedClock('2026-03-03T12:00:00Z');
    const count = await drainOutbox({ send: async (n) => { sent.push(n.body); } }, clock);

    expect(count).toBe(1);
    expect(sent).toEqual(['test']);
    const drained = await prisma.notification.findFirstOrThrow({ where: { body: 'test' } });
    expect(drained.sentAt).toEqual(clock.now());
    const untouched = await prisma.notification.findUniqueOrThrow({ where: { id: already.id } });
    expect(untouched.sentAt).toEqual(new Date('2026-01-01'));
  });
});
