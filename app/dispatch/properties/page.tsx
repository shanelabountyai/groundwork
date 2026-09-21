import Link from 'next/link';
import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { requireDispatcher } from '@/src/session';

/** BO-1: the front door — every property, with a way to add the next one. */
export default async function Properties({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await connection();
  await requireDispatcher();
  const { msg } = await searchParams;
  const properties = await prisma.property.findMany({
    orderBy: { customerName: 'asc' },
    include: { _count: { select: { agreements: true } } },
  });

  return (
    <main className="desk">
      <header className="bar">
        <h1>Properties</h1>
        <nav className="links">
          <Link className="btn primary" href="/dispatch/properties/new">New property</Link>
          <Link className="btn" href="/dispatch">Board</Link>
        </nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <div className="scroll">
        <table className="board report">
          <thead>
            <tr>
              <th scope="col">Customer</th>
              <th scope="col">Address</th>
              <th scope="col">Phone</th>
              <th scope="col">Agreements</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => (
              <tr key={p.id}>
                <th scope="row"><Link href={`/dispatch/properties/${p.id}`}>{p.customerName}</Link></th>
                <td className="pad">{p.address}</td>
                <td className="pad">{p.customerPhone}</td>
                <td className="pad num">{p._count.agreements || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {properties.length === 0 && <p>No properties yet.</p>}
    </main>
  );
}
