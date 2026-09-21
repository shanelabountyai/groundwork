import Link from 'next/link';
import { connection } from 'next/server';
import { requireDispatcher } from '@/src/session';
import { createServiceType } from '../actions';

export default async function NewServiceType({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await connection();
  await requireDispatcher();
  const { msg } = await searchParams;

  return (
    <main className="desk">
      <header className="bar">
        <h1>New service type</h1>
        <nav className="links"><Link className="btn" href="/dispatch/service-types">Service types</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <form action={createServiceType}>
        <label>Name<input name="name" required /></label>
        <label>Estimated minutes<input name="estimatedMinutes" type="number" step="1" min="1" required /></label>
        <button className="primary">Create service type</button>
      </form>
    </main>
  );
}
