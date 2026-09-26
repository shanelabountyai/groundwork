import Link from 'next/link';
import { connection } from 'next/server';
import { invoiceableVisits } from '@/src/billing/invoice';
import { usd } from '@/src/money';
import { requireDispatcher } from '@/src/session';
import { fromDbDate, shortDay } from '@/src/time';
import { buildInvoicesAction } from '../actions';

const isDate = (d?: string) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '');

/** The filter's matches, all ticked: untick to leave a visit out. One draft per property. */
export default async function NewInvoices({ searchParams }: {
  searchParams: Promise<{ from?: string; to?: string; crewId?: string; propertyId?: string; msg?: string }>;
}) {
  await connection();
  await requireDispatcher();
  const { from, to, crewId, propertyId, msg } = await searchParams;
  const filter = new URLSearchParams(Object.entries({ from, to, crewId, propertyId }).filter((e): e is [string, string] => !!e[1]));
  const visits = isDate(from) && isDate(to)
    ? await invoiceableVisits({ from: from!, to: to!, crewId: crewId || undefined, propertyId: propertyId || undefined })
    : [];

  return (
    <main className="desk">
      <header className="bar">
        <h1>New invoices</h1>
        <nav className="links"><Link className="btn" href="/dispatch/invoices">Invoices</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      {visits.length === 0 ? <p>No completed, uninvoiced visits match. <Link href="/dispatch/invoices">Change the filter</Link></p> : (
        <form action={buildInvoicesAction} className="card">
          <input type="hidden" name="filter" value={filter.toString()} />
          <fieldset>
            <legend>{visits.length} completed visit{visits.length === 1 ? '' : 's'} not yet invoiced</legend>
            {visits.map((v) => (
              <label key={v.id} className="choice">
                <input type="checkbox" name="visitId" value={v.id} defaultChecked />
                <span>
                  {v.property.customerName} · {shortDay(fromDbDate(v.date))} · {v.serviceType.name} · <span className="price">{usd(v.priceCents)}</span>
                  <span className="hint"> — {v.property.address}, {v.crew.name}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <button className="primary">Create draft invoices</button>
        </form>
      )}
    </main>
  );
}
