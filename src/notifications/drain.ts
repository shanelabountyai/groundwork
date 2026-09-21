import { systemClock, type Clock } from '../clock';
import { prisma } from '../db';
import { consoleProvider, type Provider } from './provider';

/** Drains outbox rows (sentAt IS NULL) oldest first. Stamps sentAt only after a successful send. */
export async function drainOutbox(provider: Provider = consoleProvider, clock: Clock = systemClock, limit = 50) {
  const rows = await prisma.notification.findMany({ where: { sentAt: null }, orderBy: { createdAt: 'asc' }, take: limit });
  for (const row of rows) {
    await provider.send(row);
    await prisma.notification.update({ where: { id: row.id }, data: { sentAt: clock.now() } });
  }
  return rows.length;
}
