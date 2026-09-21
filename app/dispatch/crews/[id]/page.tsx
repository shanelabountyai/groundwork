import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { requireDispatcher } from '@/src/session';
import { deleteCrew, updateCrew } from '../actions';

export default async function CrewDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  await connection();
  await requireDispatcher();
  const [{ id }, { msg }] = await Promise.all([params, searchParams]);
  const crew = await prisma.crew.findUnique({
    where: { id },
    include: { _count: { select: { agreements: true, visits: true, users: true } } },
  });
  if (!crew) notFound();
  const blocked = crew._count.agreements > 0 || crew._count.visits > 0 || crew._count.users > 0;

  return (
    <main className="desk">
      <header className="bar">
        <h1>{crew.name}</h1>
        <nav className="links"><Link className="btn" href="/dispatch/crews">Crews</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}

      <form action={updateCrew}>
        <input type="hidden" name="id" value={crew.id} />
        <label>Name<input name="name" defaultValue={crew.name} required /></label>
        <label>Home latitude<input name="homeLat" type="number" step="any" defaultValue={crew.homeLat} required /></label>
        <label>Home longitude<input name="homeLng" type="number" step="any" defaultValue={crew.homeLng} required /></label>
        <label>Max stops per day<input name="maxStops" type="number" step="1" min="1" defaultValue={crew.maxStops} required /></label>
        <label>Max minutes per day<input name="maxMinutes" type="number" step="1" min="1" defaultValue={crew.maxMinutes} required /></label>
        <button className="primary">Save</button>
      </form>

      <form action={deleteCrew}>
        <input type="hidden" name="id" value={crew.id} />
        <button className="danger" disabled={blocked}>
          {blocked ? 'Still has agreements, visits, or staff' : 'Delete crew'}
        </button>
      </form>
    </main>
  );
}
