'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { systemClock } from '@/src/clock';
import { defaultProvider } from '@/src/notifications/provider';
import { clientIp, endSession, redeemLink, requestLink, roleFor, SESSION_COOKIE, setSessionCookie } from '@/src/session';

export async function askForLink(form: FormData) {
  const login = form.get('login');
  if (typeof login === 'string') {
    try {
      await requestLink(login, systemClock, defaultProvider, await clientIp());
    } catch (e) {
      // Same answer as success: a provider failure must not reveal the account exists.
      console.error('sign-in link not sent', e);
    }
  }
  redirect('/?sent=1');
}

export async function signIn(form: FormData) {
  const token = form.get('token');
  const session = typeof token === 'string' ? await redeemLink(token) : null;
  if (!session) redirect('/?expired=1');
  await setSessionCookie(session);
  const role = await roleFor(session);
  redirect(role?.kind === 'crew' ? `/crew/${encodeURIComponent(role.crewId)}` : '/dispatch');
}

export async function signOut() {
  const jar = await cookies();
  await endSession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect('/');
}
