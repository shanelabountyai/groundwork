import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { INVOICE_STATUS as STATUS } from '@/src/billing/invoice';
import { prisma } from '@/src/db';
import { usd } from '@/src/money';
import { requireDispatcher } from '@/src/session';
import { fromDbDate, localDateOf, shortDay } from '@/src/time';
import { markPaidAction, sendInvoiceAction, voidInvoiceAction } from '../actions';

export default async function InvoicePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }>;
}) {
  await connection();
  await requireDispatcher();
  const [{ id }, { msg }] = await Promise.all([params, searchParams]);
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { property: true, visits: { orderBy: { date: 'asc' }, include: { serviceType: true } } },
  });
  if (!invoice) notFound();
  const stripeReady = !!process.env.STRIPE_SECRET_KEY;
  const open = invoice.status === 'sent' || invoice.status === 'payment_failed';
  const stamps = Object.entries({ Sent: invoice.sentAt, 'Payment failed': invoice.failedAt, Paid: invoice.paidAt, Refunded: invoice.refundedAt, Voided: invoice.voidedAt })
    .filter((s): s is [string, Date] => !!s[1]);

  return (
    <main className="desk">
      <header className="bar">
        <div>
          <h1>{invoice.property.customerName} · {usd(invoice.amountCents)}</h1>
          <p className="meta">{invoice.property.address} · {STATUS[invoice.status]}</p>
        </div>
        <nav className="links"><Link className="btn" href="/dispatch/invoices">Invoices</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <ul>
        {invoice.visits.map((v) => <li key={v.id}>{shortDay(fromDbDate(v.date))} · {v.serviceType.name} · {usd(v.priceCents)}</li>)}
        {invoice.visits.length === 0 && <li className="meta">Voided — its visits were released.</li>}
      </ul>
      <p className="meta">
        Created {localDateOf(invoice.createdAt)} by {invoice.createdBy}
        {stamps.map(([label, at]) => ` · ${label} ${localDateOf(at)}`)}
        {invoice.paidNote && ` · ${invoice.paidNote}`}
      </p>
      {open && invoice.checkoutUrl && <p className="meta">Pay link (Stripe Checkout): <a href={invoice.checkoutUrl}>{invoice.checkoutUrl}</a></p>}

      {invoice.status === 'draft' && (
        <form action={sendInvoiceAction}>
          <input type="hidden" name="id" value={invoice.id} />
          <button className="primary" disabled={!stripeReady}>Send to {invoice.property.customerEmail ?? invoice.property.customerPhone}</button>
          {!stripeReady && <p className="meta">Stripe isn&rsquo;t configured (STRIPE_SECRET_KEY), so invoices can&rsquo;t be sent yet.</p>}
        </form>
      )}
      {open && (
        <details className="panel">
          <summary>Paid another way (check, cash…)</summary>
          <form action={markPaidAction}>
            <input type="hidden" name="id" value={invoice.id} />
            <label>How<input name="note" placeholder="Check #1043" required /></label>
            <button className="primary">Mark paid</button>
          </form>
        </details>
      )}
      {(invoice.status === 'draft' || open) && (
        <details className="panel">
          <summary>Void this invoice</summary>
          <form action={voidInvoiceAction}>
            <input type="hidden" name="id" value={invoice.id} />
            <p className="meta">The pay link stops working and the visits can go on a new invoice.</p>
            <button className="danger">Void</button>
          </form>
        </details>
      )}
    </main>
  );
}
