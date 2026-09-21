import Link from 'next/link';
import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { requireDispatcher } from '@/src/session';

export default async function ServiceTypes({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await connection();
  await requireDispatcher();
  const { msg } = await searchParams;
  const serviceTypes = await prisma.serviceType.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { agreements: true } } },
  });

  return (
    <main className="desk">
      <header className="bar">
        <h1>Service types</h1>
        <nav className="links">
          <Link className="btn primary" href="/dispatch/service-types/new">New service type</Link>
          <Link className="btn" href="/dispatch">Board</Link>
        </nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <div className="scroll">
        <table className="board report">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Estimated minutes</th>
              <th scope="col">Agreements</th>
            </tr>
          </thead>
          <tbody>
            {serviceTypes.map((s) => (
              <tr key={s.id}>
                <th scope="row"><Link href={`/dispatch/service-types/${s.id}`}>{s.name}</Link></th>
                <td className="pad num">{s.estimatedMinutes}</td>
                <td className="pad num">{s._count.agreements || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {serviceTypes.length === 0 && <p>No service types yet.</p>}
    </main>
  );
}
