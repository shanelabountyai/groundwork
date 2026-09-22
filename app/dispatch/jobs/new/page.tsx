import Link from 'next/link';
import { connection } from 'next/server';
import { systemClock } from '@/src/clock';
import { prisma } from '@/src/db';
import { requireDispatcher } from '@/src/session';
import { localDateOf } from '@/src/time';
import { placeJobAction } from '../actions';

export default async function NewJob({ searchParams }: {
  searchParams: Promise<{ propertyId?: string; crewId?: string; date?: string; msg?: string }>;
}) {
  await connection();
  await requireDispatcher();
  const { propertyId, crewId, date, msg } = await searchParams;
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
          <select name="propertyId" required defaultValue={propertyId ?? ''}>
            <option value="" disabled>Choose one</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.customerName} — {p.address}</option>)}
          </select>
        </label>
        <label>
          Service type
          <select name="serviceTypeId" required defaultValue="">
            <option value="" disabled>Choose one</option>
            {serviceTypes.map((s) => <option key={s.id} value={s.id}>{s.name} (~{s.estimatedMinutes} min)</option>)}
          </select>
        </label>
        <label>Price ($)<input name="priceCents" inputMode="decimal" placeholder="45.00" required /></label>
        <label>
          Crew
          <select name="crewId" required defaultValue={crewId ?? ''}>
            <option value="" disabled>Choose one</option>
            {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Date<input name="date" type="date" min={today} defaultValue={date && date >= today ? date : today} required /></label>
        <p className="meta">Not capacity-checked: this can put the day over its limit — the board will show it.</p>
        <button className="primary">Place job</button>
      </form>
    </main>
  );
}
