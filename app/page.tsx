import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { currentRole } from '@/src/session';
import { askForLink } from './actions';

export default async function Home({ searchParams }: { searchParams: Promise<{ sent?: string; expired?: string }> }) {
  await connection();
  const role = await currentRole();
  if (role) redirect(role.kind === 'crew' ? `/crew/${encodeURIComponent(role.crewId)}` : '/dispatch');
  const { sent, expired } = await searchParams;
  return (
    <main className="crew">
      <h1>Groundwork</h1>
      <p className="meta">Evergreen Property Care</p>
      {sent && <p role="status">If that matches an account, a sign-in link is on its way. It expires in 15 minutes.</p>}
      {expired && <p role="alert">That link has expired or was already used. Ask for a new one.</p>}
      <form action={askForLink} className="stops">
        <label>
          Email or mobile number
          <input name="login" required autoComplete="username" />
        </label>
        <button className="primary">Send sign-in link</button>
      </form>
    </main>
  );
}
