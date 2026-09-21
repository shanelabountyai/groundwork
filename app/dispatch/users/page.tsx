import Link from 'next/link';
import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { requireDispatcher } from '@/src/session';

const ROLE_LABEL = { dispatcher: 'Dispatcher', crew: 'Crew' } as const;

export default async function Users({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await connection();
  await requireDispatcher();
  const { msg } = await searchParams;
  const users = await prisma.user.findMany({ orderBy: { name: 'asc' }, include: { crew: true } });

  return (
    <main className="desk">
      <header className="bar">
        <h1>Staff accounts</h1>
        <nav className="links">
          <Link className="btn primary" href="/dispatch/users/new">New account</Link>
          <Link className="btn" href="/dispatch">Board</Link>
        </nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <div className="scroll">
        <table className="board report">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              <th scope="col">Crew</th>
              <th scope="col">Email</th>
              <th scope="col">Phone</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <th scope="row"><Link href={`/dispatch/users/${u.id}`}>{u.name}</Link></th>
                <td className="pad">{ROLE_LABEL[u.role]}</td>
                <td className="pad">{u.crew?.name ?? '—'}</td>
                <td className="pad">{u.email ?? '—'}</td>
                <td className="pad">{u.phone ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {users.length === 0 && <p>No staff accounts yet.</p>}
    </main>
  );
}
