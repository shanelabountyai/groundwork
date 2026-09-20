'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ROLE_COOKIE, roleCookie, type Role } from '@/src/session';

export async function signIn(form: FormData) {
  const as = form.get('as');
  const role: Role | null = as === 'dispatcher' ? { kind: 'dispatcher' }
    : typeof as === 'string' && as.startsWith('crew:') ? { kind: 'crew', crewId: as.slice(5) } : null;
  if (!role) redirect('/');
  (await cookies()).set(ROLE_COOKIE, roleCookie(role), { httpOnly: true, sameSite: 'lax', path: '/' });
  redirect(role.kind === 'dispatcher' ? '/dispatch' : `/crew/${encodeURIComponent(role.crewId)}`);
}

export async function signOut() {
  (await cookies()).delete(ROLE_COOKIE);
  redirect('/');
}
