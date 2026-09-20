import { systemClock } from '../src/clock';
import { prisma } from '../src/db';
import type { Frequency } from '../src/generated/prisma/client';
import { resetDb } from '../src/test/harness';
import { addDays, localDateOf, mondayOf, toDbDate } from '../src/time';
import { generateVisits } from '../src/visits/generate';

/**
 * `npm run db:seed [-- --reset]`. Evergreen Property Care: 3 crews, 40 Tulsa-area
 * properties, mixed frequencies, then four weeks of visits. Synthetic data only;
 * deterministic, so every run builds the same book.
 */
if (process.env.NODE_ENV === 'production') throw new Error('The seed never runs in production.');
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '')) throw new Error('The seed only runs against local Postgres.');

if (await prisma.property.count()) {
  if (!process.argv.includes('--reset')) throw new Error('Database already has data. Re-run with -- --reset to wipe it.');
  await resetDb();
}

// Deterministic PRNG (mulberry32) so the demo is reproducible.
let seed = 0x9e3779b9;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;

// Each crew works one side of town from its own yard. (lat, lng), always.
const regions = [
  {
    crew: { name: 'Midtown', homeLat: 36.154, homeLng: -95.993 },
    zip: '7410', streets: ['S Peoria Ave', 'E 21st St', 'S Utica Ave', 'E 15th St', 'S Lewis Ave', 'S Madison Ave'],
    hoods: [[36.135, -95.975], [36.11, -95.98], [36.14, -95.965], [36.13, -95.945], [36.165, -96.005], [36.16, -95.955]],
  },
  {
    crew: { name: 'South Tulsa', homeLat: 36.04, homeLng: -95.94 },
    zip: '7413', streets: ['S Yale Ave', 'E 71st St', 'S Sheridan Rd', 'E 81st St', 'S Harvard Ave', 'S Memorial Dr'],
    hoods: [[36.06, -95.95], [36.02, -95.97], [35.95, -95.88], [36.06, -95.905], [36.0, -95.93]],
  },
  {
    crew: { name: 'East / Broken Arrow', homeLat: 36.08, homeLng: -95.82 },
    zip: '7401', streets: ['S Elm Pl', 'W Kenosha St', 'S Garnett Rd', 'E 41st St', 'S Olive Ave', 'W Houston St'],
    hoods: [[36.05, -95.79], [36.1, -95.84], [36.07, -95.82], [36.03, -95.77]],
  },
];

const serviceTypes = [
  { name: 'Mow & edge', estimatedMinutes: 45, priceCents: 5500 },
  { name: 'Full-service lawn', estimatedMinutes: 75, priceCents: 9500 },
  { name: 'Fertilize & weed', estimatedMinutes: 30, priceCents: 6500 },
  { name: 'Hedge & shrub trim', estimatedMinutes: 90, priceCents: 14000 },
];
const frequencies: Frequency[] = ['weekly', 'weekly', 'weekly', 'biweekly', 'biweekly', 'every_4_weeks', 'one_time'];
const first = ['Avery', 'Jordan', 'Morgan', 'Riley', 'Casey', 'Quinn', 'Harper', 'Rowan', 'Sage', 'Emerson', 'Parker', 'Reese'];
const last = ['Whitfield', 'Okafor', 'Delgado', 'Brennan', 'Nakamura', 'Lindqvist', 'Harjo', 'Castellano', 'Pruitt', 'Abernathy'];
const notes = ['', '', '', 'Gate code 4412#', 'Dog in back yard — text before entering', 'Text on arrival', 'Side gate sticks; lift and push', 'Do not mow the wildflower bed by the mailbox'];

const types = await Promise.all(serviceTypes.map(({ priceCents: _, ...t }) => prisma.serviceType.create({ data: t })));
const crews = await Promise.all(regions.map((r) => prisma.crew.create({ data: { ...r.crew, maxStops: 8, maxMinutes: 420 } })));

// Start dates fall on this week's weekdays, so the next four weeks fill.
const monday = mondayOf(localDateOf(systemClock.now()));

// Enough book that a crew-day is nearly full (~6 of 8 stops): pushing one day
// onto the next has to overflow, or the rain-week demo shows nothing.
const PROPERTIES = 120;

for (let i = 0; i < PROPERTIES; i++) {
  const r = regions[i % regions.length]!;
  const [lat, lng] = pick(r.hoods) as [number, number];
  const t = pick(serviceTypes.map((s, k) => ({ ...s, id: types[k]!.id })));
  const name = `${pick(first)} ${pick(last)}`;
  await prisma.agreement.create({
    data: {
      frequency: pick(frequencies),
      priceCents: t.priceCents,
      startDate: toDbDate(addDays(monday, i % 5)),
      crew: { connect: { id: crews[i % regions.length]!.id } },
      serviceType: { connect: { id: t.id } },
      property: {
        create: {
          address: `${1000 + Math.floor(rand() * 9000)} ${pick(r.streets)}, Tulsa OK ${r.zip}${Math.floor(rand() * 10)}`,
          lat: +(lat + (rand() - 0.5) * 0.02).toFixed(5),
          lng: +(lng + (rand() - 0.5) * 0.02).toFixed(5),
          accessNotes: pick(notes),
          customerName: name,
          customerPhone: `918-555-01${String(i).padStart(2, '0')}`,
          customerEmail: rand() < 0.7 ? `${name.toLowerCase().replace(' ', '.')}@example.com` : null,
        },
      },
    },
  });
}

const g = await generateVisits(systemClock, { date: monday });
console.log(`Seeded ${crews.length} crews, ${PROPERTIES} properties; ${g.created} visits from ${monday}`);
await prisma.$disconnect();
