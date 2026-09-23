import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { systemClock } from '@/src/clock';
import { requireDispatcher } from '@/src/session';
import { shortDay, type LocalDate } from '@/src/time';
import { CascadeRefused, previewAllCrews, resolveTarget } from '@/src/visits/cascade';
import { pushAllCrews } from '../../actions';

const isDate = (d: string): d is LocalDate => /^\d{4}-\d{2}-\d{2}$/.test(d);
const STATE = { clean: 'Clean', collision: 'Collision', overflow: 'Overflow' } as const;

/**
 * PX-5: rain day for every crew at once. One summary row per crew, one commit.
 * Each crew still commits in its own transaction; a collision or overflow crew
 * can be opened on its own push page to resolve stops one by one.
 */
export default async function RainAll({ params, searchParams }: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ target?: string; msg?: string }>;
}) {
  await connection();
  await requireDispatcher();
  const [{ date }, { target = 'next_service_day', msg }] = await Promise.all([params, searchParams]);
  if (!isDate(date)) notFound();

  let rows;
  try {
    rows = await previewAllCrews(systemClock, date, target);
  } catch (e) {
    if (!(e instanceof CascadeRefused)) throw e;
    return (
      <main className="desk">
        <p className="alert" role="alert">{e.message}</p>
        <Link className="btn" href="/dispatch">Back to the board</Link>
      </main>
    );
  }
  const stops = rows.reduce((n, r) => n + r.plan.moves.length, 0);
  const overflow = rows.some((r) => r.plan.overflow);

  return (
    <main className="desk">
      <header className="bar">
        <div>
          <h1>Rain day: all crews, {shortDay(date)}</h1>
          <p className="meta">{stops} stops across {rows.length} crews move to {shortDay(resolveTarget(date, target))}. Started, finished and skipped stops stay put.</p>
        </div>
        <Link className="btn" href="/dispatch">Cancel</Link>
      </header>
      {msg && <p className="alert" role="alert">{msg}</p>}

      <form method="get" className="row">
        <label>Push to
          <select name="target" defaultValue={target}>
            <option value="next_day">Next day — {shortDay(resolveTarget(date, 'next_day'))}</option>
            <option value="next_service_day">Next service day — {shortDay(resolveTarget(date, 'next_service_day'))}</option>
          </select>
        </label>
        <button>Update preview</button>
      </form>

      {rows.length === 0 ? <p className="meta" role="status">Nothing to push: no crew has a pending stop on this day.</p> : (
        <div className="scroll">
          <table className="board">
            <thead><tr><th scope="col">Crew</th><th scope="col">Stops</th><th scope="col">Result</th><th scope="col" /></tr></thead>
            <tbody>
              {rows.map(({ crew, plan }) => (
                <tr key={crew.id}>
                  <th scope="row">{crew.name}</th>
                  <td className="pad">{plan.moves.length}</td>
                  <td className={plan.state === 'overflow' ? 'over pad' : 'pad'}>
                    {STATE[plan.state as keyof typeof STATE]}
                    {plan.state === 'overflow' && ' — over capacity, needs a reason'}
                    {plan.state === 'collision' && ' — a property is already booked that day'}
                  </td>
                  <td className="pad">
                    {plan.state !== 'clean' && <Link href={`/dispatch/${crew.id}/${date}/push?target=${target}`}>Resolve stop by stop</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <form action={pushAllCrews}>
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="target" value={target} />
          {rows.flatMap(({ crew, plan }) => plan.moves.map((m) => (
            <input key={m.visit.id} type="hidden" name="expect" value={`${crew.id}:${m.visit.id}`} />
          )))}
          {overflow && (
            <label>Override reason (required — some crews go over capacity)
              <input name="reason" required placeholder="Rain Tuesday; crews agreed to long Wednesdays" />
            </label>
          )}
          <button className="danger">Push {stops} stops · notify {stops} customers</button>
        </form>
      )}
    </main>
  );
}
