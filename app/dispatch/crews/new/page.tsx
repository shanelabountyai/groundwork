import Link from 'next/link';
import { connection } from 'next/server';
import { requireDispatcher } from '@/src/session';
import { createCrew } from '../actions';

export default async function NewCrew({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await connection();
  await requireDispatcher();
  const { msg } = await searchParams;

  return (
    <main className="desk">
      <header className="bar">
        <h1>New crew</h1>
        <nav className="links"><Link className="btn" href="/dispatch/crews">Crews</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <form action={createCrew}>
        <label>Name<input name="name" required /></label>
        <label>Home latitude<input name="homeLat" type="number" step="any" required /></label>
        <label>Home longitude<input name="homeLng" type="number" step="any" required /></label>
        <label>Max stops per day<input name="maxStops" type="number" step="1" min="1" required /></label>
        <label>Max minutes per day<input name="maxMinutes" type="number" step="1" min="1" required /></label>
        <button className="primary">Create crew</button>
      </form>
    </main>
  );
}
