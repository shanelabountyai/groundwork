import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { systemClock } from '@/src/clock';
import { crewDay } from '@/src/crews/view';
import { Chip } from '../../../chip';
import { requireCrew } from '@/src/session';
import { localDateOf, toDbDate } from '@/src/time';
import { nextServiceDay } from '@/src/visits/cascade';

const dayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
const DAYS_AHEAD = 3;

// Read-only look-ahead (PX-4): the same crewDay projection as today's view, so no price and the
// dispatch board's order, but no controls — acting stays "today only" (decisions.md, Phase 3).
export default async function CrewAhead({ params }: { params: Promise<{ crewId: string }> }) {
  await connection();
  const { crewId } = await params;
  await requireCrew(crewId);
  const dates = [];
  for (let d = localDateOf(systemClock.now()); dates.length < DAYS_AHEAD; ) dates.push((d = nextServiceDay(d)));
  const days = await Promise.all(dates.map((d) => crewDay(crewId, d)));
  if (days.some((d) => !d)) notFound();

  return (
    <main className="crew">
      <header>
        <h1>Coming up</h1>
        <p><Link href={`/crew/${crewId}`}>← Today</Link></p>
      </header>
      {days.map((day) => (
        <section key={day!.date} className="card">
          <div className="bar"><h2>{dayLabel.format(toDbDate(day!.date))}</h2><Chip kind={day!.stops.length ? 'pending' : 'skip'}>{day!.stops.length ? `${day!.stops.length} stops` : 'No stops'}</Chip></div>
          <ol className="stops">
            {day!.stops.map((s, i) => (
              <li key={s.id} className="stop" aria-label={`Stop ${i + 1}: ${s.address}`}>
                <h2>{s.address}</h2>
                <p className="meta">{s.service} · ~{s.minutes} min · {s.customerName}</p>
                {s.accessNotes && <p className="access"><strong>Access:</strong> {s.accessNotes}</p>}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
