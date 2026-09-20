import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { systemClock } from '../src/clock';
import { prisma } from '../src/db';
import { resetDb } from '../src/test/harness';
import { addDays, localDateOf, toDbDate } from '../src/time';
import { generateVisits } from '../src/visits/generate';
import { UPLOAD_DIR } from '../src/visits/photos';

/**
 * Two crews: "E2E Crew" for the phone flow (three stops today), and "E2E
 * Dispatch" for the rain day — tight capacity and a property booked both days,
 * so one push hits collision and overflow at once.
 */
export default async function globalSetup() {
  if (!/@(localhost|127\.0\.0\.1)[:/][^?]*_test\b/.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('e2e only runs against a local *_test database (npm run test:e2e loads .env.test)');
  }
  await resetDb();
  const today = localDateOf(systemClock.now());
  const tomorrow = addDays(today, 1);
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

  const dispatch = await prisma.crew.create({ data: { name: 'E2E Dispatch', homeLat: 36.154, homeLng: -95.993, maxStops: 3, maxMinutes: 420 } });
  const property = async (address: string, lat: number) =>
    prisma.property.create({ data: { address, lat, lng: -95.99, customerName: 'Rain Customer', customerPhone: '918-555-0199', customerEmail: null } });
  const booked = await property('11 Rain Ave', 36.12);
  const agreement = (propertyId: string, date: string) =>
    prisma.agreement.create({
      data: {
        frequency: 'one_time', priceCents: 8800, startDate: toDbDate(date),
        crew: { connect: { id: dispatch.id } }, serviceType: { connect: { id: mow.id } }, property: { connect: { id: propertyId } },
      },
    });
  await agreement(booked.id, today);
  await agreement(booked.id, tomorrow);
  await agreement((await property('22 Storm St', 36.13)).id, today);
  await agreement((await property('33 Drizzle Dr', 36.14)).id, tomorrow);
  const doneAt = await agreement((await property('44 Done Ln', 36.15)).id, today);

  await generateVisits(systemClock);

  // A finished stop with proof, so the dispatcher's day view has a photo to show.
  await mkdir(UPLOAD_DIR, { recursive: true });
  const photo = `${randomUUID()}.png`;
  await writeFile(`${UPLOAD_DIR}/${photo}`, Buffer.from('89504e470d0a1a0a0000000d', 'hex'));
  await prisma.visit.updateMany({
    where: { agreementId: doneAt.id },
    data: { status: 'completed', startedAt: systemClock.now(), finishedAt: systemClock.now(), afterPhoto: `${UPLOAD_DIR}/${photo}`, note: 'Mowed and blown off' },
  });
  await prisma.$disconnect();
}
