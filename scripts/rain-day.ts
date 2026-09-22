import { systemClock } from '../src/clock';
import { prisma } from '../src/db';
import { fromDbDate, localDateOf, shortDay, toDbDate } from '../src/time';
import { commitCascade, previewCascade, type Target } from '../src/visits/cascade';

/**
 * The portfolio demo: `npm run rain-day -- --crew=Midtown [--date=YYYY-MM-DD]
 * [--target=next_service_day] [--commit]`. Without --commit it only previews.
 * It keeps every stop on the target day (no per-visit resolution) and overrides
 * capacity on purpose — the point is watching the board reflow.
 */
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');

const crewName = arg('crew');
const crew = crewName
  ? await prisma.crew.findFirstOrThrow({ where: { name: { contains: crewName, mode: 'insensitive' } } })
  : await prisma.crew.findFirstOrThrow({ orderBy: { name: 'asc' } });
// Without --date: the crew's next day that actually has work (the seed rests on weekends).
const date = arg('date') ?? fromDbDate((await prisma.visit.findFirstOrThrow({
  where: { crewId: crew.id, status: 'pending', date: { gte: toDbDate(localDateOf(systemClock.now())) } },
  orderBy: { date: 'asc' },
})).date);
const target: Target = arg('target') ?? 'next_service_day';

const plan = await previewCascade(systemClock, crew.id, date, target);
console.log(`\nRain day — ${crew.name}, ${shortDay(date)} → ${shortDay(plan.to)}  [${plan.state}]`);
for (const m of plan.moves) {
  console.log(`  ${m.visit.property.address} → ${shortDay(m.date)}${m.collisions.length ? '  (collides)' : ''}`);
}
for (const d of plan.days) {
  console.log(`  ${shortDay(d.date)}: ${d.load.stops}/${plan.capacity.maxStops} stops, ${(d.load.minutes / 60).toFixed(1)}/${(plan.capacity.maxMinutes / 60).toFixed(1)} h${d.over ? '  OVER' : ''}`);
}

if (!process.argv.includes('--commit')) {
  console.log('\nPreview only. Re-run with --commit to apply.');
} else {
  const before = await prisma.visit.count({ where: { crewId: crew.id } });
  const r = await commitCascade(systemClock, crew.id, date, target, {}, {
    expect: plan.moves.map((m) => m.visit.id),
    override: { reason: 'Rain day simulation', by: 'rain-day script' },
  });
  const after = await prisma.visit.count({ where: { crewId: crew.id } });
  const left = await prisma.visit.count({ where: { crewId: crew.id, date: toDbDate(date), status: 'pending' } });
  const notices = await prisma.notification.count({ where: { sentAt: null } });
  console.log(`\nMoved ${r.moved}. Visits before ${before}, after ${after} (zero lost). Still pending on ${date}: ${left}. Outbox: ${notices} unsent.`);
}
await prisma.$disconnect();
