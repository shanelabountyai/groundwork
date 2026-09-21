import Link from 'next/link';
import { connection } from 'next/server';
import { systemClock } from '@/src/clock';
import { weekBoard } from '@/src/crews/board';
import { requireDispatcher } from '@/src/session';
import { addDays, localDateOf, mondayOf, shortDay } from '@/src/time';
import { signOut } from '../actions';
import { Poll } from './poll';

const hours = (min: number) => `${(min / 60).toFixed(1)} h`;

/** Crews × days. Colour is load against capacity; click a cell for that day's route. */
export default async function Board({ searchParams }: { searchParams: Promise<{ week?: string; msg?: string }> }) {
  await connection();
  await requireDispatcher();
  const { week, msg } = await searchParams;
  const today = localDateOf(systemClock.now());
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(week ?? '') ? week! : today);
  const board = await weekBoard(monday);

  return (
    <main className="desk">
      <Poll />
      <header className="bar">
        <h1>Week of {shortDay(monday)}</h1>
        <nav className="links">
          <Link className="btn" href={`/dispatch?week=${addDays(monday, -7)}`}>← Prev</Link>
          <Link className="btn" href="/dispatch">This week</Link>
          <Link className="btn" href={`/dispatch?week=${addDays(monday, 7)}`}>Next →</Link>
          <Link className="btn" href={`/dispatch/report?week=${monday}`}>Report</Link>
          <Link className="btn" href="/dispatch/properties">Properties</Link>
        </nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <div className="scroll">
        <table className="board week">
          <thead>
            <tr><th scope="col">Crew</th>{board.days.map((d) => <th key={d} scope="col" className={d === today ? 'today' : undefined}>{shortDay(d)}</th>)}</tr>
          </thead>
          <tbody>
            {board.crews.map((c) => (
              <tr key={c.id}>
                <th scope="row">{c.name}<span className="meta">max {c.maxStops} stops · {hours(c.maxMinutes)}</span></th>
                {c.cells.map((cell) => (
                  <td key={cell.date} className={cell.level}>
                    <Link href={`/dispatch/${c.id}/${cell.date}`} aria-label={`${c.name}, ${shortDay(cell.date)}: ${cell.stops} stops, ${cell.level}`}>
                      <strong>{cell.stops}</strong> stops
                      <span>{hours(cell.minutes)}</span>
                      {cell.skipped > 0 && <span>{cell.skipped} skipped</span>}
                    </Link>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="meta legend"><span className="light">under 80%</span> <span className="full">80–100%</span> <span className="over">over capacity</span> · load is every visit not skipped, by the tighter of stops and hours</p>
      <form action={signOut}><button>Sign out</button></form>
    </main>
  );
}
