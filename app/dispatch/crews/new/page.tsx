import Link from 'next/link';
import { connection } from 'next/server';
import { formState, type SearchParams } from '@/src/forms';
import { requireDispatcher } from '@/src/session';
import { createCrew } from '../actions';

export default async function NewCrew({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  await requireDispatcher();
  const sp = await searchParams;
  const { msg } = sp;
  const f = formState(sp);

  return (
    <main className="desk">
      <header className="bar">
        <h1>New crew</h1>
        <nav className="links"><Link className="btn" href="/dispatch/crews">Crews</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <form action={createCrew}>
        <label>Name<input name="name" required {...f.props('name')} />{f.err('name')}</label>
        <label>Home latitude<input name="homeLat" type="number" step="any" required {...f.props('homeLat')} />{f.err('homeLat')}</label>
        <label>Home longitude<input name="homeLng" type="number" step="any" required {...f.props('homeLng')} />{f.err('homeLng')}</label>
        <label>Max stops per day<input name="maxStops" type="number" step="1" min="1" required {...f.props('maxStops')} />{f.err('maxStops')}</label>
        <label>Max minutes per day<input name="maxMinutes" type="number" step="1" min="1" required {...f.props('maxMinutes')} />{f.err('maxMinutes')}</label>
        <button className="primary">Create crew</button>
      </form>
    </main>
  );
}
