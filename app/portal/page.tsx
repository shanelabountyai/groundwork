import Link from 'next/link';
import { connection } from 'next/server';
import { usd } from '@/src/money';
import { currentPropertyId } from '@/src/portal/session';
import { propertyHistory, propertySchedule, type PortalVisit } from '@/src/portal/view';
import { shortDay } from '@/src/time';
import { SKIP_REASONS } from '@/src/visits/status';
import { openInvoices } from '@/src/billing/invoice';
import { Chip } from '../chip';
import { askForPortalLink, payInvoice, portalSignOut } from './actions';

const STATUS = { pending: 'Scheduled', en_route: 'Crew on the way' } as const;

export default async function Portal({ searchParams }: {
  searchParams: Promise<{ sent?: string; expired?: string; msg?: string; paid?: string }>;
}) {
  await connection();
  const propertyId = await currentPropertyId();
  const { sent, expired, msg, paid } = await searchParams;

  if (!propertyId) {
    return (
      <main className="crew">
        <h1>Evergreen Property Care</h1>
        <p className="meta">Customer portal</p>
        {sent && <p className="note" role="status">If that matches an address on file, a link is on its way. It expires in 15 minutes.</p>}
        {expired && <p className="alert" role="alert">That link has expired or was already used. Ask for a new one.</p>}
        <form action={askForPortalLink} className="stops">
          <label>
            Email or mobile number
            <input name="login" required autoComplete="username" />
          </label>
          <button className="primary">Send me a link</button>
        </form>
      </main>
    );
  }

  const [schedule, invoices, history] = await Promise.all([propertySchedule(propertyId), openInvoices(propertyId), propertyHistory(propertyId)]);
  if (!schedule) {
    return (
      <main className="crew">
        <h1>Evergreen Property Care</h1>
        <form action={portalSignOut}><button>Sign out</button></form>
      </main>
    );
  }

  return (
    <main className="crew">
      <header>
        <p className="meta">Hi, {schedule.property.customerName.split(' ')[0]}</p>
        <h1>{schedule.property.address}</h1>
        <p>{schedule.visits.length} upcoming visit{schedule.visits.length === 1 ? '' : 's'}</p>
      </header>
      {msg && <p className="alert" role="alert">{msg}</p>}
      {paid && <p className="note" role="status">Thanks — your payment is processing. This page updates once Stripe confirms it.</p>}
      {invoices.map((i) => (
        <form key={i.id} action={payInvoice} className="stop">
          <input type="hidden" name="invoiceId" value={i.id} />
          <div className="head">
            <div>
              <h2>Invoice · {usd(i.amountCents)}</h2>
              {i.status === 'payment_failed' && <p className="meta">The last payment didn&apos;t go through.</p>}
            </div>
          </div>
          <button className="primary">Pay {usd(i.amountCents)}</button>
        </form>
      ))}
      {schedule.requests.map((r) => (
        <div key={r.id} className="stop">
          <div className="bar"><h2>{r.service} · move to {shortDay(r.date)}</h2>{r.status === 'pending' ? <Chip kind="hold">On hold</Chip> : <Chip kind="bad">Not booked</Chip>}</div>
          {r.status === 'pending'
            ? <p className="meta">Awaiting confirmation — your {shortDay(r.was)} visit is on hold until we reply.</p>
            : <p className="meta" role="alert">Declined{r.note ? `: ${r.note}` : ''}. Please call the office to pick another day.</p>}
        </div>
      ))}
      {schedule.visits.length === 0 && <p>Nothing scheduled right now.</p>}
      <ol className="stops">
        {schedule.visits.map((v) => <Visit key={v.id} visit={v} />)}
      </ol>
      {history.length > 0 && (
        <>
          <h2>Past visits</h2>
          <ol className="stops">
            {history.map((h) => (
              <li key={h.id} className="stop" aria-label={`${h.service} on ${shortDay(h.date)}`}>
                <div className="head">
                  <div>
                    <h2>{shortDay(h.date)}</h2>
                    <p className="meta">
                      {h.service}
                      {h.status === 'skipped' && h.skipReason !== 'customer_request' && ` · Skipped${h.skipReason && h.skipReason !== 'other' ? `: ${SKIP_REASONS[h.skipReason]}` : ''}`}
                    </p>
                  </div>
                  <Chip kind={h.status === 'completed' ? 'done' : 'skip'}>{h.status === 'completed' ? 'Done' : h.skipReason === 'customer_request' ? 'Cancelled' : 'Skipped'}</Chip>
                </div>
                {(h.before || h.after) && (
                  <p className="links">
                    {h.before && <a href={`/portal/photos/${h.before}`}><img src={`/portal/photos/${h.before}`} alt={`Before, ${shortDay(h.date)}`} width={96} height={96} loading="lazy" /></a>}
                    {h.after && <a href={`/portal/photos/${h.after}`}><img src={`/portal/photos/${h.after}`} alt={`After, ${shortDay(h.date)}`} width={96} height={96} loading="lazy" /></a>}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      <form action={portalSignOut}><button>Sign out</button></form>
    </main>
  );
}

function Visit({ visit: v }: { visit: PortalVisit }) {
  return (
    <li className="stop" aria-label={`${v.service} on ${shortDay(v.date)}`}>
      <div className="head">
        <div>
          <h2>{shortDay(v.date)}</h2>
          <p className="meta">{v.service} · {usd(v.priceCents)}</p>
        </div>
        <Chip kind={v.status === 'en_route' ? 'enroute' : 'pending'}>{STATUS[v.status]}</Chip>
      </div>
      {v.status === 'pending' && (
        <details className="panel">
          <summary>Need to change this one?</summary>
          <div className="stops">
            <Link className="btn" href={`/portal/reschedule/${v.id}`}>Reschedule this visit</Link>
            <Link className="btn outline-danger" href={`/portal/cancel/${v.id}`}>Cancel this visit</Link>
          </div>
        </details>
      )}
    </li>
  );
}
