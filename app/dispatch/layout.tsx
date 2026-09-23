import { prisma } from '@/src/db';
import { currentRole } from '@/src/session';
import { signOut } from '../actions';
import { DispatchNav } from './nav';

export default async function DispatchLayout({ children }: { children: React.ReactNode }) {
  // Pages own the redirect (requireDispatcher). Redirecting here too races theirs and the stream closes early.
  if ((await currentRole())?.kind !== 'dispatcher') return children;
  const pending = await prisma.rescheduleRequest.count({ where: { status: 'pending' } });
  return (
    <>
      <div className="topnav">
        <div className="inner">
          <b>Groundwork</b>
          <DispatchNav pending={pending} />
          <form action={signOut} className="signout"><button>Sign out</button></form>
        </div>
      </div>
      {children}
    </>
  );
}
