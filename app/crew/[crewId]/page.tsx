import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { systemClock } from '@/src/clock';
import { openShift } from '@/src/crews/timesheet';
import { crewDay, type CrewStop } from '@/src/crews/view';
import { requireCrew } from '@/src/session';
import { localDateOf, toDbDate } from '@/src/time';
import { SKIP_REASONS } from '@/src/visits/status';
import { signOut } from '../../actions';
import { clockInAction, clockOutAction, completeStop, skipStop, startStop } from './actions';

const STATUS = { pending: 'To do', en_route: 'En route', completed: 'Done', skipped: 'Skipped' } as const;
const timeLabel = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
const dayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
// (lat, lng), in that order — the universal link opens whichever maps app the phone has.
const mapLink = (s: CrewStop) => `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;

export default async function CrewToday({ params, searchParams }: {
  params: Promise<{ crewId: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  await connection();
  const [{ crewId }, { msg }] = await Promise.all([params, searchParams]);
  const me = await requireCrew(crewId);
  const [day, shift] = await Promise.all([crewDay(crewId, localDateOf(systemClock.now())), openShift(me.userId)]);
  if (!day) notFound();
  const done = day.stops.filter((s) => s.status === 'completed' || s.status === 'skipped').length;

  return (
    <main className="crew">
      <header>
        <h1>{day.crew.name}</h1>
        <p>{dayLabel.format(toDbDate(day.date))} · {done} of {day.stops.length} stops done</p>
      </header>
      {msg && <p className="alert" role="alert">{msg}</p>}
      {shift ? (
        <form action={clockOutAction} className="clock">
          <p>{me.name} · clocked in {timeLabel.format(shift.clockIn)}</p>
          <button>Clock out</button>
        </form>
      ) : (
        <form action={clockInAction} className="clock">
          <p>{me.name} · not clocked in</p>
          <button className="primary">Clock in</button>
        </form>
      )}
      {day.stops.length === 0 && <p>No stops today.</p>}
      <ol className="stops">
        {day.stops.map((s, i) => <Stop key={s.id} stop={s} n={i + 1} />)}
      </ol>
      <form action={signOut}><button>Sign out</button></form>
    </main>
  );
}

function Stop({ stop: s, n }: { stop: CrewStop; n: number }) {
  const open = s.status === 'pending' || s.status === 'en_route';
  const ids = <input type="hidden" name="visitId" value={s.id} />;
  return (
    <li className={`stop ${s.status}`} aria-label={`Stop ${n}: ${s.address}`}>
      <div className="head">
        <span className="n">{n}</span>
        <div>
          <h2>{s.address}</h2>
          <p className="meta">{s.service} · ~{s.minutes} min · {s.customerName}</p>
        </div>
        <span className="status">{STATUS[s.status]}</span>
      </div>
      {s.accessNotes && open && <p className="access"><strong>Access:</strong> {s.accessNotes}</p>}
      {s.status === 'skipped' && <p className="meta">Skipped: {SKIP_REASONS[s.skipReason!]}{s.note && ` — ${s.note}`}</p>}
      {s.status === 'completed' && s.note && <p className="meta">Note: {s.note}</p>}
      {open && (
        <>
          <div className="links">
            <a className="btn" href={mapLink(s)} target="_blank" rel="noopener">Map</a>
            <a className="btn" href={`tel:${s.customerPhone}`}>Call</a>
            <a className="btn" href={`sms:${s.customerPhone}`}>Text</a>
          </div>
          {s.status === 'pending' && (
            <form action={startStop}>{ids}<button className="primary">Start — on my way</button></form>
          )}
          {s.status === 'en_route' && (
            <details className="panel">
              <summary className="primary">Complete stop</summary>
              <form action={completeStop}>
                {ids}
                <label>Before photo<input type="file" name="before" accept="image/*" capture="environment" /></label>
                <label>After photo<input type="file" name="after" accept="image/*" capture="environment" /></label>
                <label>Note<textarea name="note" rows={2} /></label>
                <button className="primary">Mark complete</button>
              </form>
            </details>
          )}
          <details className="panel">
            <summary>Skip stop</summary>
            <form action={skipStop}>
              {ids}
              <fieldset>
                <legend>Reason</legend>
                {Object.entries(SKIP_REASONS).map(([value, label]) => (
                  <label key={value} className="choice"><input type="radio" name="reason" value={value} required />{label}</label>
                ))}
              </fieldset>
              <label>Note (required for Other)<textarea name="note" rows={2} /></label>
              <button className="danger">Skip this stop</button>
            </form>
          </details>
        </>
      )}
    </li>
  );
}
