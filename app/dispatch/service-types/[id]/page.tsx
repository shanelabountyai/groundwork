import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { requireDispatcher } from '@/src/session';
import { deleteServiceType, updateServiceType } from '../actions';

export default async function ServiceTypeDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  await connection();
  await requireDispatcher();
  const [{ id }, { msg }] = await Promise.all([params, searchParams]);
  const serviceType = await prisma.serviceType.findUnique({
    where: { id },
    include: { _count: { select: { agreements: true, jobs: true } } },
  });
  if (!serviceType) notFound();

  return (
    <main className="desk">
      <header className="bar">
        <h1>{serviceType.name}</h1>
        <nav className="links"><Link className="btn" href="/dispatch/service-types">Service types</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}

      <form action={updateServiceType}>
        <input type="hidden" name="id" value={serviceType.id} />
        <label>Name<input name="name" defaultValue={serviceType.name} required /></label>
        <label>Estimated minutes<input name="estimatedMinutes" type="number" step="1" min="1" defaultValue={serviceType.estimatedMinutes} required /></label>
        <button className="primary">Save</button>
      </form>

      <form action={deleteServiceType}>
        <input type="hidden" name="id" value={serviceType.id} />
        <button className="danger" disabled={serviceType._count.agreements + serviceType._count.jobs > 0}>
          {serviceType._count.agreements + serviceType._count.jobs > 0 ? 'Still used by an agreement or job' : 'Delete service type'}
        </button>
      </form>
    </main>
  );
}
