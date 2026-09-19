import Link from 'next/link';
import { connection } from 'next/server';
import { prisma } from '@/src/db';

/** Pick your crew. Sign-in replaces this when crews get accounts. */
export default async function Crews() {
  await connection();
  const crews = await prisma.crew.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
  return (
    <main className="crew">
      <h1>Which crew?</h1>
      <ul className="stops">
        {crews.map((c) => <li key={c.id}><Link className="btn primary" href={`/crew/${c.id}`}>{c.name}</Link></li>)}
      </ul>
    </main>
  );
}
