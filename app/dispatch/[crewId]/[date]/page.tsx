import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { usd } from '@/src/money';
import { routeFor } from '@/src/routes/day';
import { requireDispatcher } from '@/src/session';
import { addDays, shortDay, type LocalDate } from '@/src/time';
import { skipOffers } from '@/src/visits/makeup';
import { SKIP_REASONS } from '@/src/visits/status';
import { autoOrder, bookMakeUpStop, moveStop } from '../../actions';

const STATUS = { pending: 'To do', en_route: 'En route', completed: 'Done', skipped: 'Skipped' } as const;
const isDate = (d: string): d is LocalDate => /^\d{4}-\d{2}-\d{2}$/.test(d);

/** One crew-day the dispatcher's way: order, money, proof photos, and the rain-day button. */
export default async function DispatchDay({ params, searchParams }: {
  params: Promise<{ crewId: string; date: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  await connection();
  await requireDispatcher();
  const [{ crewId, date }, { msg }] = await Promise.all([params, searchParams]);
  if (!isDate(date)) notFound();
  const crew = await prisma.crew.findUnique({ where: { id: crewId }, select: { id: true, name: true, maxStops: true, maxMinutes: true } });
  if (!crew) notFound();
  const { manual, stops, estimate } = await routeFor(crewId, date);
  const live = stops.filter((s) => s.status !== 'skipped');
  const minutes = live.reduce((m, s) => m + s.serviceType.estimatedMinutes, 0);
  const revenue = stops.filter((s) => s.status === 'completed').reduce((c, s) => c + s.priceCents, 0);
  const pending = stops.filter((s) => s.status === 'pending').length;
  const offers = await skipOffers(crewId, stops.filter((s) => s.status === 'skipped'));

  return (
    <main className="desk">
      <header className="bar">
        <div>
          <h1>{crew.name} · {shortDay(date)}</h1>
          <p className="meta">
            {live.length}/{crew.maxStops} stops · {(minutes / 60).toFixed(1)}/{(crew.maxMinutes / 60).toFixed(1)} h of work
            {' · '}~{estimate.miles} mi, ~{estimate.driveMinutes} min driving (straight-line estimate, not drive time)
            {revenue > 0 && ` · ${usd(revenue)} completed`}
          </p>
        </div>
        <nav className="links">
          <Link className="btn" href={`/dispatch/${crewId}/${addDays(date, -1)}`}>← {shortDay(addDays(date, -1))}</Link>
          <Link className="btn" href={`/dispatch?week=${date}`}>Board</Link>
          <Link className="btn" href={`/dispatch/${crewId}/${addDays(date, 1)}`}>{shortDay(addDays(date, 1))} →</Link>
        </nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}

      <div className="row">
        <Link className="btn" href={`/dispatch/jobs/new?crewId=${crewId}&date=${date}`}>Add one-off job</Link>
        {pending > 0 && <Link className="btn danger" href={`/dispatch/${crewId}/${date}/push`}>Rain day — push {pending} stops</Link>}
        {manual
          ? <form action={autoOrder}><input type="hidden" name="crewId" value={crewId} /><input type="hidden" name="date" value={date} /><button>Re-run auto-order</button></form>
          : <p className="meta">Auto-ordered nearest-neighbour from the yard. Moving a stop hands the day to you.</p>}
      </div>

      <ol className="stops">
        {stops.map((s, i) => {
          const makeUp = offers.get(s.id);
          return (
          <li key={s.id} className={`stop ${s.status}`} aria-label={`Stop ${i + 1}: ${s.property.address}`}>
            <div className="head">
              <span className="n">{i + 1}</span>
              <div>
                <h2>{s.property.address}</h2>
                <p className="meta">
                  {s.serviceType.name} · ~{s.serviceType.estimatedMinutes} min ·{' '}
                  <span className="price">{usd(s.priceCents)}</span> · {s.property.customerName} · {s.property.customerPhone}
                  {s.detached && ' · rescheduled'}
                  {s.jobId && ' · one-off'}
                </p>
              </div>
              <span className="status">{STATUS[s.status]}</span>
            </div>
            {s.property.accessNotes && <p className="access"><strong>Access:</strong> {s.property.accessNotes}</p>}
            {s.status === 'skipped' && <p className="meta">Skipped: {SKIP_REASONS[s.skipReason!]}{s.note && ` — ${s.note}`}</p>}
            {makeUp?.booked && <p className="meta">Make-up booked for {shortDay(makeUp.booked)}.</p>}
            {makeUp?.offer && (
              <form action={bookMakeUpStop} className="row">
                <input type="hidden" name="crewId" value={crewId} />
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="visitId" value={s.id} />
                <input type="hidden" name="on" value={makeUp.offer} />
                <button>Book make-up {shortDay(makeUp.offer)}</button>
              </form>
            )}
            {makeUp && !makeUp.booked && !makeUp.offer && (
              <p className="meta">{crew.name} has no open slot in the next two weeks — move it by hand.</p>
            )}
            {s.status === 'completed' && s.note && <p className="meta">Note: {s.note}</p>}
            {(s.beforePhoto || s.afterPhoto) && (
              <div className="photos">
                {[['Before', s.beforePhoto], ['After', s.afterPhoto]].map(([label, path]) => path && (
                  /* eslint-disable-next-line @next/next/no-img-element -- local disk, not a CDN; next/image would need a loader */
                  <img key={label} src={`/photos/${path.split('/').pop()}`} alt={`${label} — ${s.property.address}`} width={120} height={120} />
                ))}
              </div>
            )}
            <form action={moveStop} className="row">
              <input type="hidden" name="crewId" value={crewId} />
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="visitId" value={s.id} />
              <button name="dir" value="up" disabled={i === 0} aria-label={`Move ${s.property.address} earlier`}>↑</button>
              <button name="dir" value="down" disabled={i === stops.length - 1} aria-label={`Move ${s.property.address} later`}>↓</button>
            </form>
          </li>
          );
        })}
      </ol>
      {stops.length === 0 && <p>Nothing scheduled.</p>}
    </main>
  );
}
