import Link from 'next/link';
import { connection } from 'next/server';
import { formState, type SearchParams } from '@/src/forms';
import { requireDispatcher } from '@/src/session';
import { createServiceType } from '../actions';

export default async function NewServiceType({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  await requireDispatcher();
  const sp = await searchParams;
  const { msg } = sp;
  const f = formState(sp);

  return (
    <main className="desk">
      <header className="bar">
        <h1>New service type</h1>
        <nav className="links"><Link className="btn" href="/dispatch/service-types">Service types</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <form action={createServiceType}>
        <label>Name<input name="name" required {...f.props('name')} />{f.err('name')}</label>
        <label>Estimated minutes<input name="estimatedMinutes" type="number" step="1" min="1" required {...f.props('estimatedMinutes')} />{f.err('estimatedMinutes')}</label>
        <button className="primary">Create service type</button>
      </form>
    </main>
  );
}
