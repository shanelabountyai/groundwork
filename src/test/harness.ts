import { prisma } from '../db';
import type { Frequency } from '../visits/recurrence';
import { toDbDate, type LocalDate } from '../time';

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

let n = 0;

export async function makeCrew(name = `Crew ${++n}`) {
  return prisma.crew.create({ data: { name, homeLat: 36.154, homeLng: -95.993, maxStops: 12, maxMinutes: 480 } });
}

/** An agreement with its own property, service type and (unless given) crew. */
export async function makeAgreement(frequency: Frequency, startDate: LocalDate, opts: { crewId?: string; priceCents?: number; propertyId?: string } = {}) {
  const i = ++n;
  const crewId = opts.crewId ?? (await makeCrew()).id;
  return prisma.agreement.create({
    data: {
      frequency,
      startDate: toDbDate(startDate),
      priceCents: opts.priceCents ?? 4500,
      crew: { connect: { id: crewId } },
      serviceType: { create: { name: `Mow ${i}`, estimatedMinutes: 30 } },
      property: opts.propertyId ? { connect: { id: opts.propertyId } } : {
        create: { address: `${i} Test St, Tulsa OK`, lat: 36.1 + i / 1000, lng: -95.9, customerName: `Customer ${i}`, customerPhone: '555-0100' },
      },
    },
  });
}
