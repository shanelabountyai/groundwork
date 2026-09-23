import Link from 'next/link';
import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { requireDispatcher } from '@/src/session';

/** BO-1: the front door — every property, with a way to add the next one. */
export default async function Properties({ searchParams }: { searchParams: Promise<{ msg?: string; q?: string }> }) {
  await connection();
  await requireDispatcher();
  const { msg, q = '' } = await searchParams;
  const term = q.trim();
  // ponytail: plain ILIKE, no index — fine at a few hundred rows; add pg_trgm if the table outgrows a seq scan.
  const has = (field: 'customerName' | 'address' | 'customerPhone' | 'customerEmail') => ({ [field]: { contains: term, mode: 'insensitive' as const } });
  const properties = await prisma.property.findMany({
    where: term ? { OR: [has('customerName'), has('address'), has('customerPhone'), has('customerEmail')] } : undefined,
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
      <form method="get" role="search" className="row">
        <input name="q" type="search" defaultValue={term} placeholder="Name, address, phone or email" aria-label="Search properties" />
        <button>Search</button>
        {term && <Link className="btn" href="/dispatch/properties">Clear</Link>}
      </form>
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
      {properties.length === 0 && <p>{term ? `Nothing matches “${term}”.` : 'No properties yet.'}</p>}
    </main>
  );
}
