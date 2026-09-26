import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { usd } from '@/src/money';
import { formState, type SearchParams } from '@/src/forms';
import { requireDispatcher } from '@/src/session';
import { fromDbDate, shortDay } from '@/src/time';
import { messageOne } from '../../actions';
import { deleteProperty, updateProperty } from '../actions';

const FREQUENCIES = { weekly: 'Weekly', biweekly: 'Biweekly', every_4_weeks: 'Every 4 weeks', one_time: 'One time' } as const;

export default async function PropertyDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  await requireDispatcher();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { msg } = sp;
  const f = formState(sp);
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

      <form action={updateProperty} className="card">
        <input type="hidden" name="id" value={property.id} />
        <label>Customer name<input name="customerName" required {...f.props('customerName', property.customerName)} />{f.err('customerName')}</label>
        <div className="grid2">
          <label>Phone<input name="customerPhone" required {...f.props('customerPhone', property.customerPhone)} />{f.err('customerPhone')}</label>
          <label>Email (optional)<input name="customerEmail" type="email" {...f.props('customerEmail', property.customerEmail ?? '')} />{f.err('customerEmail')}</label>
        </div>
        <label>Address<input name="address" required {...f.props('address', property.address)} />{f.err('address')}</label>
        <div className="grid2">
          <label>Latitude<input name="lat" type="number" step="any" required {...f.props('lat', property.lat)} />{f.err('lat')}</label>
          <label>Longitude<input name="lng" type="number" step="any" required {...f.props('lng', property.lng)} />{f.err('lng')}</label>
        </div>
        <label>Access notes<textarea name="accessNotes" rows={2} {...f.props('accessNotes', property.accessNotes)} />{f.err('accessNotes')}</label>
        <label className="choice"><input type="checkbox" name="notifyOnEnRoute" defaultChecked={property.notifyOnEnRoute} />Text on en route</label>
        <button className="primary">Save</button>
      </form>

      <div className="grid2">
        <div className="col">
          <form action={messageOne} className="card">
            <input type="hidden" name="id" value={property.id} />
            <label>Message this customer<textarea name="body" rows={2} maxLength={320} required /></label>
            <div className="row"><button>Send</button></div>
          </form>

          <section className="card">
            <div className="bar">
              <h2>Agreements</h2>
              <Link className="btn" href={`/dispatch/agreements/new?propertyId=${property.id}`}>Add agreement</Link>
            </div>
            {property.agreements.length === 0
              ? <p className="hint">None yet.</p>
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
        </div>

        <div className="col">
          <section className="card">
            <div className="bar">
              <h2>One-off jobs</h2>
              <Link className="btn" href={`/dispatch/jobs/new?propertyId=${property.id}`}>Place one-off job</Link>
            </div>
            {property.jobs.length === 0
              ? <p className="hint">None.</p>
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

          <form action={deleteProperty} className="card">
            <input type="hidden" name="id" value={property.id} />
            <button className="danger" disabled={property.agreements.length + property.jobs.length > 0}>
              {property.agreements.length + property.jobs.length > 0 ? 'Has agreements or one-off jobs — its history stays' : 'Delete property'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
