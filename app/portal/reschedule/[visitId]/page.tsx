import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { usd } from '@/src/money';
import { currentPropertyId } from '@/src/portal/session';
import { propertySchedule } from '@/src/portal/view';
import { shortDay } from '@/src/time';
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
        <form method="get" className="stops">
          <label>
            New date
            <input type="date" name="date" required min={earliestPick()} max={latestPick()} defaultValue={date} />
          </label>
          <button className="primary">Review</button>
        </form>
      )}
      <Link href="/portal">Keep it as is</Link>
    </main>
  );
}
