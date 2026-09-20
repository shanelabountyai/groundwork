import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { systemClock } from '@/src/clock';
import { prisma } from '@/src/db';
import { requireDispatcher } from '@/src/session';
import { shortDay, type LocalDate } from '@/src/time';
import { CascadeRefused, previewCascade, resolveTarget, type Resolution } from '@/src/visits/cascade';
import { SKIP_REASONS } from '@/src/visits/status';
import { pushDay } from '../../../actions';

const isDate = (d: string): d is LocalDate => /^\d{4}-\d{2}-\d{2}$/.test(d);
const STATE = {
  empty: 'Nothing to push: no stop on this day is still pending.',
  clean: 'Clean push — every stop lands on a day with room and no double-booking.',
  collision: 'Collision: a property below already has a visit on the day its stop would land. Keep both, or push that one further.',
  overflow: 'Overflow: a landing day would go over the crew’s capacity. Commit needs a reason, and it is logged.',
} as const;

/**
 * The rain-day preview (P0-6). Every input is in the URL, so the preview is a
 * plain GET a dispatcher can re-run, share or back out of; only the commit is
 * a POST. No client JS: "Update preview" is a GET submit, "Push" is the action.
 */
export default async function PushPreview({ params, searchParams }: {
  params: Promise<{ crewId: string; date: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  await requireDispatcher();
  const [{ crewId, date }, query] = await Promise.all([params, searchParams]);
  if (!isDate(date)) notFound();
  const crew = await prisma.crew.findUnique({ where: { id: crewId }, select: { name: true } });
  if (!crew) notFound();

  const one = (k: string) => (typeof query[k] === 'string' ? query[k] : undefined);
  // A typed date wins over the radios, so "preview that date" needs no second control.
  const target = (isDate(one('on') ?? '') ? one('on')! : one('target')) ?? 'next_service_day';
  const choices = Object.fromEntries(
    Object.entries(query).flatMap(([k, v]) => (k.startsWith('r:') && v === 'further' ? [[k.slice(2), 'further' as Resolution]] : [])),
  );

  let plan;
  try {
    plan = await previewCascade(systemClock, crewId, date, target, choices);
  } catch (e) {
    if (!(e instanceof CascadeRefused)) throw e;
    return (
      <main className="desk">
        <p className="alert" role="alert">{e.message}</p>
        <Link className="btn" href={`/dispatch/${crewId}/${date}`}>Back to the day</Link>
      </main>
    );
  }

  const hidden = [
    <input key="c" type="hidden" name="crewId" value={crewId} />,
    <input key="d" type="hidden" name="date" value={date} />,
    <input key="t" type="hidden" name="target" value={target} />,
  ];

  return (
    <main className="desk">
      <header className="bar">
        <div>
          <h1>Rain day: {crew.name}, {shortDay(date)}</h1>
          <p className="meta">{plan.moves.length} stops move to {shortDay(plan.to)}. Started, finished and skipped stops stay put.</p>
        </div>
        <Link className="btn" href={`/dispatch/${crewId}/${date}`}>Cancel</Link>
      </header>
      {one('msg') && <p className="alert" role="alert">{one('msg')}</p>}
      <p className={plan.state === 'clean' ? 'meta' : plan.state === 'overflow' ? 'alert' : 'warn'} role="status">{STATE[plan.state as keyof typeof STATE]}</p>

      <form method="get" className="stops">
        <fieldset>
          <legend>Push to</legend>
          {[['next_day', `Next day — ${shortDay(resolveTarget(date, 'next_day'))}`], ['next_service_day', `Next service day — ${shortDay(resolveTarget(date, 'next_service_day'))}`]].map(([value, label]) => (
            <label key={value} className="choice">
              <input type="radio" name="target" value={value} defaultChecked={target === value} />{label}
            </label>
          ))}
          <label>A specific date<input type="date" name="on" defaultValue={isDate(target) ? target : ''} min={date} /></label>
        </fieldset>

        {plan.moves.map((m) => (
          <div key={m.visit.id} className={`stop ${m.collisions.length ? 'collide' : ''}`}>
            <div>
              <h2>{m.visit.agreement.property.address}</h2>
              <p className="meta">{m.visit.agreement.serviceType.name} · ~{m.visit.agreement.serviceType.estimatedMinutes} min · {m.visit.agreement.property.customerName}</p>
            </div>
            {m.collisions.map((c) => (
              <p key={c.id} className="warn">
                Already on {shortDay(m.date)}: {c.agreement.serviceType.name} at this property
                {c.status !== 'pending' && ` (${c.status === 'skipped' ? SKIP_REASONS[c.skipReason!] : c.status})`}
              </p>
            ))}
            <fieldset className="row">
              <legend className="hint">Lands {shortDay(m.date)}</legend>
              <label className="choice"><input type="radio" name={`r:${m.visit.id}`} value="keep" defaultChecked={m.resolution === 'keep'} />Keep on {shortDay(plan.to)}</label>
              <label className="choice"><input type="radio" name={`r:${m.visit.id}`} value="further" defaultChecked={m.resolution === 'further'} />Push further, to {shortDay(plan.further)}</label>
            </fieldset>
          </div>
        ))}

        {plan.staying.length > 0 && (
          <p className="meta">Staying on {shortDay(date)}: {plan.staying.map((s) => `${s.agreement.property.address} (${s.status})`).join(', ')}</p>
        )}
        {plan.moves.length > 0 && <button>Update preview</button>}
      </form>

      <div className="scroll">
      <table className="board">
        <caption className="meta">Landing days, after the push</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">Already there</th><th scope="col">Arriving</th><th scope="col">Load</th></tr></thead>
        <tbody>
          {plan.days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{shortDay(d.date)}</th>
              <td className="pad">{d.existing.length}</td>
              <td className="pad">{d.incoming.length}</td>
              <td className={d.over ? 'over pad' : 'pad'}>
                {d.load.stops}/{plan.capacity.maxStops} stops · {(d.load.minutes / 60).toFixed(1)}/{(plan.capacity.maxMinutes / 60).toFixed(1)} h
                {d.over && ' — over capacity'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {plan.moves.length > 0 && (
        <form action={pushDay}>
          {hidden}
          {plan.moves.map((m) => (
            <span key={m.visit.id}>
              <input type="hidden" name="expect" value={m.visit.id} />
              <input type="hidden" name={`r:${m.visit.id}`} value={m.resolution} />
            </span>
          ))}
          {plan.overflow && (
            <label>Override reason (required — this day goes over capacity)
              <input name="reason" required placeholder="Rain Tuesday; crew agreed to a long Wednesday" />
            </label>
          )}
          <button className="danger">Push {plan.moves.length} stops · notify {plan.moves.length} customers</button>
        </form>
      )}
    </main>
  );
}
