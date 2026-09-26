import Link from 'next/link';
import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { formState, type SearchParams } from '@/src/forms';
import { requireDispatcher } from '@/src/session';
import { createUser } from '../actions';

export default async function NewUser({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  await requireDispatcher();
  const sp = await searchParams;
  const { msg } = sp;
  const f = formState(sp);
  const crews = await prisma.crew.findMany({ orderBy: { name: 'asc' } });

  return (
    <main className="desk">
      <header className="bar">
        <h1>New staff account</h1>
        <nav className="links"><Link className="btn" href="/dispatch/users">Staff accounts</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <form action={createUser} className="card">
        <label>Name<input name="name" required {...f.props('name')} />{f.err('name')}</label>
        <div className="grid2">
          <label>
            Role
            <select name="role" required {...f.props('role', '')}>
              <option value="" disabled>Choose one</option>
              <option value="dispatcher">Dispatcher</option>
              <option value="crew">Crew</option>
            </select>
            {f.err('role')}
          </label>
          <label>
            Crew (crew role only)
            <select name="crewId" {...f.props('crewId', '')}>
              <option value="">—</option>
              {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {f.err('crewId')}
          </label>
        </div>
        <div className="grid2">
          <label>Email<input name="email" type="email" {...f.props('email')} />{f.err('email')}</label>
          <label>Phone<input name="phone" placeholder="(918) 555-0142" {...f.props('phone')} />{f.err('phone')}</label>
        </div>
        <button className="primary">Create account</button>
      </form>
      <p className="meta">An email or phone is required — that&apos;s where the sign-in link goes.</p>
      {crews.length === 0 && <p className="warn">No crews exist yet — add one before creating a crew account.</p>}
    </main>
  );
}
