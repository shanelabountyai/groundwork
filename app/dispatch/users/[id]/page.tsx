import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { formState, type SearchParams } from '@/src/forms';
import { requireDispatcher } from '@/src/session';
import { deleteUser, updateUser } from '../actions';

export default async function UserDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  await requireDispatcher();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { msg } = sp;
  const f = formState(sp);
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
        <label>Name<input name="name" required {...f.props('name', user.name)} />{f.err('name')}</label>
        <label>
          Role
          <select name="role" required {...f.props('role', user.role)}>
            <option value="dispatcher">Dispatcher</option>
            <option value="crew">Crew</option>
          </select>
          {f.err('role')}
        </label>
        <label>
          Crew (crew role only)
          <select name="crewId" {...f.props('crewId', user.crewId ?? '')}>
            <option value="">—</option>
            {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {f.err('crewId')}
        </label>
        <label>Email<input name="email" type="email" {...f.props('email', user.email ?? '')} />{f.err('email')}</label>
        <label>Phone<input name="phone" placeholder="(918) 555-0142" {...f.props('phone', user.phone ?? '')} />{f.err('phone')}</label>
        <button className="primary">Save</button>
      </form>

      <form action={deleteUser}>
        <input type="hidden" name="id" value={user.id} />
        <button className="danger">Delete account</button>
      </form>
    </main>
  );
}
