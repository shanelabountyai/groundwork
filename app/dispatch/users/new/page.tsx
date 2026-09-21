import Link from 'next/link';
import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { requireDispatcher } from '@/src/session';
import { createUser } from '../actions';

export default async function NewUser({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await connection();
  await requireDispatcher();
  const { msg } = await searchParams;
  const crews = await prisma.crew.findMany({ orderBy: { name: 'asc' } });

  return (
    <main className="desk">
      <header className="bar">
        <h1>New staff account</h1>
        <nav className="links"><Link className="btn" href="/dispatch/users">Staff accounts</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <form action={createUser}>
        <label>Name<input name="name" required /></label>
        <label>
          Role
          <select name="role" required defaultValue="">
            <option value="" disabled>Choose one</option>
            <option value="dispatcher">Dispatcher</option>
            <option value="crew">Crew</option>
          </select>
        </label>
        <label>
          Crew (crew role only)
          <select name="crewId" defaultValue="">
            <option value="">—</option>
            {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Email<input name="email" type="email" /></label>
        <label>Phone<input name="phone" placeholder="(918) 555-0142" /></label>
        <button className="primary">Create account</button>
      </form>
      <p className="meta">An email or phone is required — that&apos;s where the sign-in link goes.</p>
      {crews.length === 0 && <p className="warn">No crews exist yet — add one before creating a crew account.</p>}
    </main>
  );
}
