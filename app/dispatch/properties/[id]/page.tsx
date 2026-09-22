import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { usd } from '@/src/money';
import { requireDispatcher } from '@/src/session';
import { fromDbDate, shortDay } from '@/src/time';
import { deleteProperty, updateProperty } from '../actions';

const FREQUENCIES = { weekly: 'Weekly', biweekly: 'Biweekly', every_4_weeks: 'Every 4 weeks', one_time: 'One time' } as const;

export default async function PropertyDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  await connection();
  await requireDispatcher();
  const [{ id }, { msg }] = await Promise.all([params, searchParams]);
  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      agreements: { include: { serviceType: true, crew: true }, orderBy: { createdAt: 'asc' } },
      jobs: { include: { serviceType: true, visits: { select: { date: true, status: true }, orderBy: { occurrenceDate: 'asc' } } }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!property) notFound();

  return (
    <main className="desk">
      <header className="bar">
        <h1>{property.customerName}</h1>
        <nav className="links"><Link className="btn" href="/dispatch/properties">Properties</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}

      <form action={updateProperty}>
        <input type="hidden" name="id" value={property.id} />
        <label>Customer name<input name="customerName" defaultValue={property.customerName} required /></label>
        <label>Phone<input name="customerPhone" defaultValue={property.customerPhone} required /></label>
        <label>Email (optional)<input name="customerEmail" type="email" defaultValue={property.customerEmail ?? ''} /></label>
        <label>Address<input name="address" defaultValue={property.address} required /></label>
        <label>Latitude<input name="lat" type="number" step="any" defaultValue={property.lat} required /></label>
        <label>Longitude<input name="lng" type="number" step="any" defaultValue={property.lng} required /></label>
        <label>Access notes<textarea name="accessNotes" rows={2} defaultValue={property.accessNotes} /></label>
        <label className="choice"><input type="checkbox" name="notifyOnEnRoute" defaultChecked={property.notifyOnEnRoute} />Text on en route</label>
        <button className="primary">Save</button>
      </form>

      <section>
        <div className="row">
          <h2>Agreements</h2>
          <Link className="btn" href={`/dispatch/agreements/new?propertyId=${property.id}`}>Add agreement</Link>
        </div>
        {property.agreements.length === 0
          ? <p className="meta">None yet.</p>
          : (
            <ol className="stops">
              {property.agreements.map((a) => (
                <li key={a.id} className="stop">
                  <Link href={`/dispatch/agreements/${a.id}`}>
                    {a.serviceType.name} · {FREQUENCIES[a.frequency]} · {usd(a.priceCents)} · {a.crew.name}
                    {a.paused && ' · paused'}
                  </Link>
                </li>
              ))}
            </ol>
          )}
      </section>

      <section>
        <div className="row">
          <h2>One-off jobs</h2>
          <Link className="btn" href={`/dispatch/jobs/new?propertyId=${property.id}`}>Place one-off job</Link>
        </div>
        {property.jobs.length === 0
          ? <p className="meta">None.</p>
          : (
            <ol className="stops">
              {property.jobs.map((j) => (
                <li key={j.id} className="stop">
                  {j.serviceType.name} · {usd(j.priceCents)} · {j.visits.map((v) => `${shortDay(fromDbDate(v.date))} (${v.status})`).join(', ')} · by {j.createdBy}
                </li>
              ))}
            </ol>
          )}
      </section>

      <form action={deleteProperty}>
        <input type="hidden" name="id" value={property.id} />
        <button className="danger" disabled={property.agreements.length + property.jobs.length > 0}>
          {property.agreements.length + property.jobs.length > 0 ? 'Has agreements or one-off jobs — its history stays' : 'Delete property'}
        </button>
      </form>
    </main>
  );
}
