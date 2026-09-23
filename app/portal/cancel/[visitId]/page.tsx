import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { usd } from '@/src/money';
import { currentPropertyId } from '@/src/portal/session';
import { propertySchedule } from '@/src/portal/view';
import { shortDay } from '@/src/time';
import { requestSkip } from '../../actions';

/**
 * GET previews, POST commits — the same shape as the rain-day cascade, and no
 * client JS. The lookup is scoped to the signed-in property, so another
 * customer's visit id renders the same "no longer open" as a stale one.
 */
export default async function ConfirmCancel({ params }: { params: Promise<{ visitId: string }> }) {
  await connection();
  const propertyId = await currentPropertyId();
  if (!propertyId) redirect('/portal');
  const { visitId } = await params;
  const schedule = await propertySchedule(propertyId);
  const v = schedule?.visits.find((x) => x.id === visitId && x.status === 'pending');
  if (!v) redirect(`/portal?msg=${encodeURIComponent('That visit is no longer open to cancel.')}`);

  return (
    <main className="crew">
      <h1>Cancel this visit?</h1>
      <div className="stop">
        <h2>{shortDay(v.date)}</h2>
        <p className="meta">{v.service} · {usd(v.priceCents)}</p>
      </div>
      <form action={requestSkip} className="stops">
        <input type="hidden" name="visitId" value={v.id} />
        <button className="danger">Yes, cancel this visit</button>
      </form>
      <Link href="/portal">Keep it</Link>
    </main>
  );
}
