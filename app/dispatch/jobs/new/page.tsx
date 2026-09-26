import Link from 'next/link';
import { connection } from 'next/server';
import { systemClock } from '@/src/clock';
import { prisma } from '@/src/db';
import { formState, type SearchParams } from '@/src/forms';
import { requireDispatcher } from '@/src/session';
import { localDateOf } from '@/src/time';
import { placeJobAction } from '../actions';

export default async function NewJob({ searchParams }: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  await requireDispatcher();
  const sp = await searchParams;
  const { propertyId, crewId, date, msg } = sp;
  const f = formState(sp);
  const [properties, serviceTypes, crews] = await Promise.all([
    prisma.property.findMany({ orderBy: { customerName: 'asc' }, select: { id: true, customerName: true, address: true } }),
    prisma.serviceType.findMany({ orderBy: { name: 'asc' } }),
    prisma.crew.findMany({ orderBy: { name: 'asc' } }),
  ]);
  const today = localDateOf(systemClock.now());

  return (
    <main className="desk">
      <header className="bar">
        <h1>One-off job</h1>
        <nav className="links"><Link className="btn" href="/dispatch">Board</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <form action={placeJobAction}>
        <label>
          Property
          <select name="propertyId" required {...f.props('propertyId', propertyId ?? '')}>
            <option value="" disabled>Choose one</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.customerName} — {p.address}</option>)}
          </select>
        </label>
        <label>
          Service type
          <select name="serviceTypeId" required {...f.props('serviceTypeId', '')}>
            <option value="" disabled>Choose one</option>
            {serviceTypes.map((s) => <option key={s.id} value={s.id}>{s.name} (~{s.estimatedMinutes} min)</option>)}
          </select>
        </label>
        <label>Price ($)<input name="priceCents" inputMode="decimal" placeholder="45.00" required {...f.props('priceCents')} />{f.err('priceCents')}</label>
        <label>
          Crew
          <select name="crewId" required {...f.props('crewId', crewId ?? '')}>
            <option value="" disabled>Choose one</option>
            {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Date<input name="date" type="date" min={today} required {...f.props('date', date && date >= today ? date : today)} />{f.err('date')}</label>
        <p className="callout warn"><strong>Not capacity-checked</strong>This can put the day over its limit. The board will show it.</p>
        <button className="primary">Place job</button>
      </form>
    </main>
  );
}
