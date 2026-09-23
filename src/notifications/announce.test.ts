import { beforeEach, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { prisma } from '../db';
import { makeAgreement, makeCrew, resetDb } from '../test/harness';
import { generateVisits } from '../visits/generate';
import { MessageRefused, messageCrewDay, messageProperty } from './announce';

beforeEach(resetDb);

it('crew-day message goes once to each customer still on the route, not to skipped or finished stops', async () => {
  const crew = await makeCrew();
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => makeAgreement('one_time', '2026-03-03', { crewId: crew.id })));
  await generateVisits(fixedClock('2026-03-02T17:00:00Z'), { date: '2026-03-03' });
  const visit = (id: string) => prisma.visit.findFirstOrThrow({ where: { agreementId: id } });
  await prisma.visit.update({ where: { id: (await visit(b!.id)).id }, data: { status: 'skipped', skipReason: 'weather', finishedAt: new Date() } });
  await prisma.visit.update({ where: { id: (await visit(c!.id)).id }, data: { status: 'completed', startedAt: new Date('2026-03-03T14:00:00Z'), finishedAt: new Date('2026-03-03T15:00:00Z') } });
  await prisma.property.update({ where: { id: a!.propertyId }, data: { customerEmail: 'a@example.com' } });

  expect(await messageCrewDay(crew.id, '2026-03-03', 'Running 30 minutes late today.')).toBe(1);
  const rows = await prisma.notification.findMany();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ channel: 'email', to: 'a@example.com', visitId: null, sentAt: null });
  expect(rows[0]!.body).toBe('Evergreen Property Care: Running 30 minutes late today.');
});

it('refuses an empty or over-long message and an empty route, queueing nothing', async () => {
  const crew = await makeCrew();
  const a = await makeAgreement('one_time', '2026-03-03', { crewId: crew.id });
  await expect(messageProperty(a.propertyId, '   ')).rejects.toThrow(MessageRefused);
  await expect(messageProperty(a.propertyId, 'x'.repeat(321))).rejects.toThrow(MessageRefused);
  await expect(messageCrewDay(crew.id, '2026-03-03', 'hi')).rejects.toThrow('Nobody left');
  expect(await prisma.notification.count()).toBe(0);
  expect(await messageProperty(a.propertyId, 'hi')).toBe(1);
  expect((await prisma.notification.findFirstOrThrow()).channel).toBe('sms');
});
