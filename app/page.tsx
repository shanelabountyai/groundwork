import { connection } from 'next/server';
import { prisma } from '@/src/db';
import { signIn } from './actions';

/** Who are you? The dev role switcher; real sign-in replaces src/session.ts. */
export default async function Home() {
  await connection();
  const crews = await prisma.crew.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
  return (
    <main className="crew">
      <h1>Groundwork</h1>
      <p className="meta">Evergreen Property Care. Dev sign-in: pick a role, no password.</p>
      <form action={signIn} className="stops">
        <button className="primary" name="as" value="dispatcher">Dispatcher</button>
        <h2>Crews</h2>
        {crews.map((c) => <button key={c.id} name="as" value={`crew:${c.id}`}>{c.name}</button>)}
      </form>
    </main>
  );
}
