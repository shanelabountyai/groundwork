import { systemClock } from '../src/clock';
import { prisma } from '../src/db';
import { resetDb } from '../src/test/harness';
import { localDateOf, toDbDate } from '../src/time';
import { generateVisits } from '../src/visits/generate';

/** One crew with three stops today. Refuses anything but a local *_test database. */
export default async function globalSetup() {
  if (!/@(localhost|127\.0\.0\.1)[:/][^?]*_test\b/.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('e2e only runs against a local *_test database (npm run test:e2e loads .env.test)');
  }
  await resetDb();
  const today = localDateOf(systemClock.now());
  const crew = await prisma.crew.create({ data: { name: 'E2E Crew', homeLat: 36.154, homeLng: -95.993, maxStops: 8, maxMinutes: 420 } });
  const mow = await prisma.serviceType.create({ data: { name: 'Mow & edge', estimatedMinutes: 45 } });
  const stops = [
    { address: '101 First St', lat: 36.16, notes: 'Gate code 4412#' },
    { address: '202 Second St', lat: 36.17, notes: 'Dog in back yard — text before entering' },
    { address: '303 Third St', lat: 36.18, notes: '' },
  ];
  for (const [i, s] of stops.entries()) {
    await prisma.agreement.create({
      data: {
        frequency: 'one_time', priceCents: 12345, startDate: toDbDate(today),
        crew: { connect: { id: crew.id } }, serviceType: { connect: { id: mow.id } },
        property: { create: { address: s.address, lat: s.lat, lng: -95.993, accessNotes: s.notes, customerName: `Customer ${i + 1}`, customerPhone: '918-555-0100' } },
      },
    });
  }
  await generateVisits(systemClock);
  await prisma.$disconnect();
}
