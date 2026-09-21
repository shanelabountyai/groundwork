import Link from 'next/link';
import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { requireDispatcher } from '@/src/session';

export default async function Crews({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await connection();
  await requireDispatcher();
  const { msg } = await searchParams;
  const crews = await prisma.crew.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { agreements: true, users: true } } },
  });

  return (
    <main className="desk">
      <header className="bar">
        <h1>Crews</h1>
        <nav className="links">
          <Link className="btn primary" href="/dispatch/crews/new">New crew</Link>
          <Link className="btn" href="/dispatch">Board</Link>
        </nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <div className="scroll">
        <table className="board report">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Max stops</th>
              <th scope="col">Max minutes</th>
              <th scope="col">Agreements</th>
              <th scope="col">Staff</th>
            </tr>
          </thead>
          <tbody>
            {crews.map((c) => (
              <tr key={c.id}>
                <th scope="row"><Link href={`/dispatch/crews/${c.id}`}>{c.name}</Link></th>
                <td className="pad num">{c.maxStops}</td>
                <td className="pad num">{c.maxMinutes}</td>
                <td className="pad num">{c._count.agreements || '—'}</td>
                <td className="pad num">{c._count.users || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {crews.length === 0 && <p>No crews yet.</p>}
    </main>
  );
}
