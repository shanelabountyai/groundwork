import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * The dev-mode role switcher (decisions.md, Phase 4). There is no
 * authentication: whoever picks "Dispatcher" is one. What is real is the
 * split: dispatcher pages and photos check this role, and a crew acts only as
 * the crew it picked. A real deployment replaces this file and nothing else.
 */
export const ROLE_COOKIE = 'groundwork_as';

export type Role = { kind: 'dispatcher' } | { kind: 'crew'; crewId: string };

export async function currentRole(): Promise<Role | null> {
  const v = (await cookies()).get(ROLE_COOKIE)?.value;
  if (v === 'dispatcher') return { kind: 'dispatcher' };
  if (v?.startsWith('crew:')) return { kind: 'crew', crewId: v.slice(5) };
  return null;
}

export const roleCookie = (r: Role) => (r.kind === 'dispatcher' ? 'dispatcher' : `crew:${r.crewId}`);

export async function requireDispatcher() {
  if ((await currentRole())?.kind !== 'dispatcher') redirect('/');
}

/** The crew id this session acts as, or a redirect to the picker. */
export async function requireCrew(crewId: string) {
  const r = await currentRole();
  if (r?.kind !== 'crew' || r.crewId !== crewId) redirect('/');
  return r.crewId;
}
