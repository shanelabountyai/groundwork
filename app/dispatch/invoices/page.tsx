import Link from 'next/link';
import { connection } from 'next/server';
import { systemClock } from '@/src/clock';
import { INVOICE_STATUS as STATUS } from '@/src/billing/invoice';
import { prisma } from '@/src/db';
import { usd } from '@/src/money';
import { requireDispatcher } from '@/src/session';
import { addDays, localDateOf, mondayOf } from '@/src/time';

/** BO-4: every invoice, newest first, and the filter that starts the next batch. */
export default async function Invoices({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await connection();
  await requireDispatcher();
  const { msg } = await searchParams;
  const [invoices, crews, properties] = await Promise.all([
    prisma.invoice.findMany({ orderBy: { createdAt: 'desc' }, include: { property: true, _count: { select: { visits: true } } } }),
    prisma.crew.findMany({ orderBy: { name: 'asc' } }),
    prisma.property.findMany({ orderBy: { customerName: 'asc' }, select: { id: true, customerName: true, address: true } }),
  ]);
  const lastMonday = addDays(mondayOf(localDateOf(systemClock.now())), -7);

  return (
    <main className="desk">
      <header className="bar">
        <h1>Invoices</h1>
        <nav className="links">
          <Link className="btn" href="/dispatch">Board</Link>
          <Link className="btn" href="/dispatch/report">Report</Link>
        </nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <details className="panel" open={invoices.length === 0}>
        <summary>New invoices from completed work</summary>
        <form action="/dispatch/invoices/new">
          <div className="row">
            <label>From<input name="from" type="date" defaultValue={lastMonday} required /></label>
            <label>To<input name="to" type="date" defaultValue={addDays(lastMonday, 6)} required /></label>
          </div>
          <label>
            Crew
            <select name="crewId" defaultValue="">
              <option value="">Any crew</option>
              {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            Property
            <select name="propertyId" defaultValue="">
              <option value="">Any property</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.customerName} — {p.address}</option>)}
            </select>
          </label>
          <button className="primary">Find uninvoiced visits</button>
        </form>
      </details>
      <div className="scroll">
        <table className="board report">
          <thead>
            <tr>
              <th scope="col">Customer</th>
              <th scope="col">Visits</th>
              <th scope="col">Amount</th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <th scope="row">
                  <Link href={`/dispatch/invoices/${i.id}`}>{i.property.customerName}</Link>
                  <span className="meta">{i.property.address}</span>
                </th>
                <td className="pad num">{i._count.visits || '—'}</td>
                <td className="pad num price">{usd(i.amountCents)}</td>
                <td className="pad">{STATUS[i.status]}</td>
                <td className="pad">{localDateOf(i.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {invoices.length === 0 && <p>No invoices yet.</p>}
    </main>
  );
}
