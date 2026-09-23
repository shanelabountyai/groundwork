import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { usd } from '@/src/money';
import { currentPropertyId } from '@/src/portal/session';
import { propertySchedule } from '@/src/portal/view';
import { shortDay } from '@/src/time';
import { addDays, toDbDate } from '@/src/time';
import { isServiceDay } from '@/src/visits/cascade';
import { checkPick, earliestPick, fitsOn, latestPick, RescheduleRefused } from '@/src/visits/reschedule';
import { commitReschedule } from '../../actions';

/**
 * No date: the picker. With `?date=`: the preview, which says plainly whether
 * the day books now or waits on the office. GET previews, POST commits.
 */
export default async function Reschedule({ params, searchParams }: {
  params: Promise<{ visitId: string }>; searchParams: Promise<{ date?: string; msg?: string }>;
}) {
  await connection();
  const propertyId = await currentPropertyId();
  if (!propertyId) redirect('/portal');
  const { visitId } = await params;
  const { date = '' } = await searchParams;
  const schedule = await propertySchedule(propertyId);
  const v = schedule?.visits.find((x) => x.id === visitId && x.status === 'pending');
  if (!v) redirect(`/portal?msg=${encodeURIComponent('That visit is no longer open to reschedule.')}`);

  let problem: string | undefined;
  let books = false;
  if (date) {
    try {
      checkPick(date);
      books = await fitsOn(v.id, date);
    } catch (e) {
      if (!(e instanceof RescheduleRefused)) throw e;
      problem = e.message;
    }
  }

  return (
    <main className="crew">
      <h1>Reschedule this visit</h1>
      <div className="stop">
        <h2>{shortDay(v.date)}</h2>
        <p className="meta">{v.service} · {usd(v.priceCents)}</p>
      </div>
      {problem && <p className="alert" role="alert">{problem}</p>}
      {date && !problem ? (
        <form action={commitReschedule} className="stops">
          <p>
            Move to <strong>{shortDay(date)}</strong> at the same price.{' '}
            {books ? 'This day is open, so it books right away.' : 'That day is full, so it goes to our office to confirm. Your current visit is held until they reply.'}
          </p>
          <input type="hidden" name="visitId" value={v.id} />
          <input type="hidden" name="date" value={date} />
          <button className="primary">Yes, {books ? 'move it to' : 'request'} {shortDay(date)}</button>
          <Link href={`/portal/reschedule/${v.id}`}>Pick another day</Link>
        </form>
      ) : (
        <Calendar visitId={v.id} picked={date} />
      )}
      <Link className="btn" href="/portal">Keep it as is</Link>
    </main>
  );
}

const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Weekdays in the open window are links; everything else is greyed out. GET previews, so no JavaScript. */
function Calendar({ visitId, picked }: { visitId: string; picked: string }) {
  const first = earliestPick();
  const last = latestPick();
  const months: { key: string; days: string[] }[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const key = d.slice(0, 7);
    if (months.at(-1)?.key !== key) months.push({ key, days: [] });
    months.at(-1)!.days.push(d);
  }
  return (
    <div className="stops">
      <p className="meta">Pick a new day. We work Monday to Friday.</p>
      {months.map((m) => {
        const lead = (toDbDate(m.days[0]! as `${number}-${number}-${number}`).getUTCDay() + 6) % 7;
        return (
          <section key={m.key} className="card" aria-label={monthName.format(toDbDate(`${m.key}-01`))}>
            <h2>{monthName.format(toDbDate(`${m.key}-01`))}</h2>
            <div className="cal">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => <b key={i} aria-hidden="true">{l}</b>)}
              {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
              {m.days.map((d) => isServiceDay(d as `${number}-${number}-${number}`)
                ? <Link key={d} href={`/portal/reschedule/${visitId}?date=${d}`} aria-label={shortDay(d as `${number}-${number}-${number}`)} aria-current={d === picked ? 'date' : undefined}>{Number(d.slice(8))}</Link>
                : <span key={d} className="off" aria-hidden="true">{Number(d.slice(8))}</span>)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
