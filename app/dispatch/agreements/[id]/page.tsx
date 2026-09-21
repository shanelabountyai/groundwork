import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { requireDispatcher } from '@/src/session';
import { shortDay } from '@/src/time';
import { togglePauseAction, updateAgreementAction } from '../actions';

const FREQUENCIES = { weekly: 'Weekly', biweekly: 'Biweekly', every_4_weeks: 'Every 4 weeks', one_time: 'One time' } as const;

export default async function AgreementDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  await connection();
  await requireDispatcher();
  const [{ id }, { msg }, crews] = await Promise.all([
    params, searchParams, prisma.crew.findMany({ orderBy: { name: 'asc' } }),
  ]);
  const agreement = await prisma.agreement.findUnique({
    where: { id }, include: { property: true, serviceType: true },
  });
  if (!agreement) notFound();

  return (
    <main className="desk">
      <header className="bar">
        <h1>{agreement.serviceType.name} · {agreement.property.customerName}</h1>
        <nav className="links"><Link className="btn" href={`/dispatch/properties/${agreement.propertyId}`}>Back</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <p className="meta">Started {shortDay(agreement.startDate.toISOString().slice(0, 10))} · {agreement.paused ? 'Paused' : 'Active'}</p>

      <form action={updateAgreementAction}>
        <input type="hidden" name="id" value={agreement.id} />
        <input type="hidden" name="propertyId" value={agreement.propertyId} />
        <label>
          Frequency
          <select name="frequency" required defaultValue={agreement.frequency}>
            {Object.entries(FREQUENCIES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
        <label>
          Crew
          <select name="crewId" required defaultValue={agreement.crewId}>
            {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Price (per visit, $)<input name="priceCents" inputMode="decimal" defaultValue={(agreement.priceCents / 100).toFixed(2)} required /></label>
        <button className="primary">Save</button>
      </form>

      <form action={togglePauseAction}>
        <input type="hidden" name="id" value={agreement.id} />
        <input type="hidden" name="propertyId" value={agreement.propertyId} />
        <input type="hidden" name="paused" value={(!agreement.paused).toString()} />
        <button className={agreement.paused ? 'primary' : 'danger'}>{agreement.paused ? 'Resume' : 'Pause'}</button>
      </form>
    </main>
  );
}
