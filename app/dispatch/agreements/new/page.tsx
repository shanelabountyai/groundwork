import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { systemClock } from '@/src/clock';
import { prisma } from '@/src/db';
import { formState, type SearchParams } from '@/src/forms';
import { requireDispatcher } from '@/src/session';
import { localDateOf } from '@/src/time';
import { createAgreementAction } from '../actions';

const FREQUENCIES = { weekly: 'Weekly', biweekly: 'Biweekly', every_4_weeks: 'Every 4 weeks', one_time: 'One time' } as const;

export default async function NewAgreement({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  await requireDispatcher();
  const sp = await searchParams;
  const { propertyId, msg } = sp;
  const f = formState(sp);
  if (!propertyId) notFound();
  const [property, serviceTypes, crews] = await Promise.all([
    prisma.property.findUnique({ where: { id: propertyId }, select: { id: true, customerName: true } }),
    prisma.serviceType.findMany({ orderBy: { name: 'asc' } }),
    prisma.crew.findMany({ orderBy: { name: 'asc' } }),
  ]);
  if (!property) notFound();

  return (
    <main className="desk">
      <header className="bar">
        <h1>New agreement · {property.customerName}</h1>
        <nav className="links"><Link className="btn" href={`/dispatch/properties/${property.id}`}>Back</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <form action={createAgreementAction}>
        <input type="hidden" name="propertyId" value={property.id} />
        <label>
          Service type
          <select name="serviceTypeId" required {...f.props('serviceTypeId', '')}>
            <option value="" disabled>Choose one</option>
            {serviceTypes.map((s) => <option key={s.id} value={s.id}>{s.name} (~{s.estimatedMinutes} min)</option>)}
          </select>
        </label>
        <label>
          Crew
          <select name="crewId" required {...f.props('crewId', '')}>
            <option value="" disabled>Choose one</option>
            {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          Frequency
          <select name="frequency" required {...f.props('frequency', 'weekly')}>
            {Object.entries(FREQUENCIES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
        <label>Price (per visit, $)<input name="priceCents" inputMode="decimal" placeholder="45.00" required {...f.props('priceCents')} />{f.err('priceCents')}</label>
        <label>Start date<input name="startDate" type="date" required {...f.props('startDate', localDateOf(systemClock.now()))} />{f.err('startDate')}</label>
        <button className="primary">Create agreement</button>
      </form>
      {serviceTypes.length === 0 && <p className="warn">No service types exist yet — add one before creating an agreement.</p>}
      {crews.length === 0 && <p className="warn">No crews exist yet — add one before creating an agreement.</p>}
    </main>
  );
}
