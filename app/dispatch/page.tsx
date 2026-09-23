import Link from 'next/link';
import { connection } from 'next/server';
import { systemClock } from '@/src/clock';
import { weekBoard } from '@/src/crews/board';
import { requireDispatcher } from '@/src/session';
import { addDays, localDateOf, mondayOf, shortDay } from '@/src/time';
import { Chip } from '../chip';
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
        <form method="get" action="/dispatch/properties" role="search" className="row">
          <input name="q" type="search" placeholder="Find a customer" aria-label="Search properties" />
          <button>Search</button>
        </form>
        <nav className="links" aria-label="Week">
          <Link className="btn" href={`/dispatch?week=${addDays(monday, -7)}`}>← Prev</Link>
          <Link className="btn" href="/dispatch">This week</Link>
          <Link className="btn" href={`/dispatch?week=${addDays(monday, 7)}`}>Next →</Link>
        </nav>
        <Link className="btn primary rain" href={`/dispatch/rain/${today}`}>Rain day — all crews</Link>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <div className="scroll weekwrap">
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
                      {cell.level === 'empty' ? <span>No stops</span> : (
                        <>
                          <strong>{cell.stops}/{c.maxStops} stops</strong>
                          <span>{hours(cell.minutes)} / {hours(c.maxMinutes)}</span>
                        </>
                      )}
                      {cell.level === 'full' && <span className="tagline">Full</span>}
                      {cell.level === 'over' && <span className="tagline">Over capacity</span>}
                      {cell.skipped > 0 && <span>{cell.skipped} skipped</span>}
                    </Link>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="daylist" aria-label="Week by day">
        {board.days.map((d) => (
          <section key={d} className={`daycard ${d === today ? 'today' : ''}`}>
            <div className="bar"><h2>{shortDay(d)}</h2>{d === today && <Chip kind="hold">Today</Chip>}</div>
            <ul>
              {board.crews.map((c) => {
                const cell = c.cells.find((x) => x.date === d)!;
                const share = Math.min(100, Math.round(Math.max(cell.stops / c.maxStops, cell.minutes / c.maxMinutes) * 100));
                return (
                  <li key={c.id}>
                    {cell.level === 'empty'
                      ? <div className="bar"><b>{c.name}</b><span className="meta">Rest day</span></div>
                      : (
                        <Link href={`/dispatch/${c.id}/${d}`} aria-label={`${c.name}, ${shortDay(d)}: ${cell.stops} stops, ${cell.level}`}>
                          <div className="bar"><b>{c.name}</b><span className="meta">{cell.stops}/{c.maxStops} stops · {hours(cell.minutes)} / {hours(c.maxMinutes)}{cell.level === 'full' ? ' · Full' : cell.level === 'over' ? ' · OVER' : ''}</span></div>
                          <div className={`meter ${cell.level}`}><b style={{ width: `${share}%` }} /></div>
                          {cell.skipped > 0 && <span className="meta">{cell.skipped} skipped</span>}
                        </Link>
                      )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <p className="meta legend"><span className="light">under 80%</span> <span className="full">80–100%: Full</span> <span className="over">Over capacity</span> · load is every visit not skipped, by the tighter of stops and hours</p>
    </main>
  );
}
