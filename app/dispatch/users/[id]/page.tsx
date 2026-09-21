import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { requireDispatcher } from '@/src/session';
import { deleteUser, updateUser } from '../actions';

export default async function UserDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  await connection();
  await requireDispatcher();
  const [{ id }, { msg }] = await Promise.all([params, searchParams]);
  const [user, crews] = await Promise.all([
    prisma.user.findUnique({ where: { id } }),
    prisma.crew.findMany({ orderBy: { name: 'asc' } }),
  ]);
  if (!user) notFound();

  return (
    <main className="desk">
      <header className="bar">
        <h1>{user.name}</h1>
        <nav className="links"><Link className="btn" href="/dispatch/users">Staff accounts</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}

      <form action={updateUser}>
        <input type="hidden" name="id" value={user.id} />
        <label>Name<input name="name" defaultValue={user.name} required /></label>
        <label>
          Role
          <select name="role" required defaultValue={user.role}>
            <option value="dispatcher">Dispatcher</option>
            <option value="crew">Crew</option>
          </select>
        </label>
        <label>
          Crew (crew role only)
          <select name="crewId" defaultValue={user.crewId ?? ''}>
            <option value="">—</option>
            {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Email<input name="email" type="email" defaultValue={user.email ?? ''} /></label>
        <label>Phone<input name="phone" defaultValue={user.phone ?? ''} placeholder="(918) 555-0142" /></label>
        <button className="primary">Save</button>
      </form>

      <form action={deleteUser}>
        <input type="hidden" name="id" value={user.id} />
        <button className="danger">Delete account</button>
      </form>
    </main>
  );
}
