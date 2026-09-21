import { drainOutbox } from '../src/notifications/drain';
import { prisma } from '../src/db';

/** Run on a schedule (cron), outside the request path: `npm run outbox:drain`. */
const sent = await drainOutbox();
console.log(`Outbox: sent ${sent}.`);
await prisma.$disconnect();
