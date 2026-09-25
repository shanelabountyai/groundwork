import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { formState, type SearchParams } from '@/src/forms';
import { requireDispatcher } from '@/src/session';
import { deleteCrew, updateCrew } from '../actions';

export default async function CrewDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  await requireDispatcher();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { msg } = sp;
  const f = formState(sp);
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
        <label>Name<input name="name" required {...f.props('name', crew.name)} />{f.err('name')}</label>
        <label>Home latitude<input name="homeLat" type="number" step="any" required {...f.props('homeLat', crew.homeLat)} />{f.err('homeLat')}</label>
        <label>Home longitude<input name="homeLng" type="number" step="any" required {...f.props('homeLng', crew.homeLng)} />{f.err('homeLng')}</label>
        <label>Max stops per day<input name="maxStops" type="number" step="1" min="1" required {...f.props('maxStops', crew.maxStops)} />{f.err('maxStops')}</label>
        <label>Max minutes per day<input name="maxMinutes" type="number" step="1" min="1" required {...f.props('maxMinutes', crew.maxMinutes)} />{f.err('maxMinutes')}</label>
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
