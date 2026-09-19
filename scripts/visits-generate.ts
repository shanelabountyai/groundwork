import { systemClock } from '../src/clock';
import { prisma } from '../src/db';
import { generateVisits } from '../src/visits/generate';

/**
 * `npm run visits:generate -- --date=2026-03-02`. With no date, the horizon
 * starts today. Idempotent: running it twice is the same as running it once.
 */
const date = process.argv.find((a) => a.startsWith('--date='))?.slice('--date='.length);
if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date must be YYYY-MM-DD, got "${date}"`);

const r = await generateVisits(systemClock, { date });
console.log(`${r.agreements} agreements: ${r.created} visits created, ${r.withdrawn} withdrawn`);
await prisma.$disconnect();
