import Link from 'next/link';
import { connection } from 'next/server';
import { usd } from '@/src/money';
import { requireDispatcher } from '@/src/session';
import { fromDbDate, shortDay } from '@/src/time';
import { decidedRequests, pendingRequests } from '@/src/visits/reschedule';
import { Chip } from '../../chip';
import { approveRequest, declineRequest } from './actions';

/** Customer date picks the crew-day couldn't absorb. Approve books over capacity (logged); decline says why. */
export default async function Reschedules({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await connection();
  await requireDispatcher();
  const { msg } = await searchParams;
  const [requests, decided] = await Promise.all([pendingRequests(), decidedRequests()]);
  return (
    <main className="desk">
      <header className="bar">
        <h1>Reschedule requests</h1>
        <nav className="links"><Link className="btn" href="/dispatch">Board</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      {requests.length === 0 && <p>Nothing waiting.</p>}
      <ul className="stops">
        {requests.map((r) => (
          <li key={r.id} className="stop">
            <div className="bar"><h2>{r.visit.property.customerName} · {r.visit.serviceType.name} · {usd(r.visit.priceCents)}</h2><Chip kind="hold">Waiting</Chip></div>
            <p className="meta">{r.visit.property.address} · {r.visit.crew.name} · from {shortDay(fromDbDate(r.visit.date))} to <strong>{shortDay(fromDbDate(r.requestedDate))}</strong></p>
            <form action={approveRequest} className="row">
              <input type="hidden" name="id" value={r.id} />
              <button className="primary">Approve (over capacity)</button>
            </form>
            <form action={declineRequest} className="row">
              <input type="hidden" name="id" value={r.id} />
              <input name="note" placeholder="Reason the customer will see" required />
              <button className="danger">Decline</button>
            </form>
          </li>
        ))}
      </ul>
      {decided.length > 0 && (
        <>
          <h2>Recently decided</h2>
          <ul className="stops">
            {decided.map((r) => (
              <li key={r.id} className="stop">
                <div className="bar">
                  <h2>{r.visit.property.customerName} · {r.visit.serviceType.name}</h2>
                  <Chip kind={r.status === 'approved' ? 'done' : 'skip'}>{r.status === 'approved' ? 'Approved' : 'Declined'}</Chip>
                </div>
                <p className="meta">To {shortDay(fromDbDate(r.requestedDate))} · {r.decidedBy ?? 'a dispatcher'}{r.note && <> · “{r.note}”</>}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
