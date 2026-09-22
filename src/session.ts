import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DAY, systemClock, type Clock } from './clock';
import { prisma } from './db';
import { defaultProvider, type Provider } from './notifications/provider';

/**
 * Magic-link sign-in (decisions.md, Phase 9). A user asks for a link by email
 * or phone; the link's token is single use and short-lived, and redeeming it
 * mints a session. Only SHA-256 hashes of either token are stored, so a
 * database read cannot sign anyone in. The role split below is unchanged from
 * the dev switcher this replaced.
 */
export const SESSION_COOKIE = 'groundwork_session';
const LINK_TTL = 15 * 60_000;
const LINK_COOLDOWN = 60_000;
const SESSION_TTL = 30 * DAY;

export type Role = { kind: 'dispatcher'; name: string } | { kind: 'crew'; crewId: string; userId: string; name: string };

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const appUrl = () => process.env.APP_URL ?? 'http://localhost:3900';

/** What someone typed → the stored form: lowercased email, or E.164 phone (US default). */
export function normalizeLogin(input: string): { email: string } | { phone: string } | null {
  const s = input.trim();
  if (s.includes('@')) return /^[^\s@]+@[^\s@]+$/.test(s) ? { email: s.toLowerCase() } : null;
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? { phone: `+${digits}` } : null;
  if (digits.length === 10) return { phone: `+1${digits}` };
  if (digits.length === 11 && digits.startsWith('1')) return { phone: `+${digits}` };
  return null;
}

/**
 * Sends a sign-in link if `login` matches a user. Says nothing either way, so
 * the form cannot be used to probe who has an account.
 */
export async function requestLink(login: string, clock: Clock = systemClock, provider: Provider = defaultProvider) {
  const key = normalizeLogin(login);
  const user = key && (await prisma.user.findUnique({ where: key }));
  if (!user) return;
  const now = clock.now();
  // ponytail: per-user cooldown only, stops one account being SMS-bombed; add a per-IP limit if the form gets scripted across accounts.
  if (await prisma.loginToken.count({ where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - LINK_COOLDOWN) } } })) return;
  const token = newToken();
  await prisma.loginToken.create({ data: { hash: hash(token), userId: user.id, createdAt: now, expiresAt: new Date(now.getTime() + LINK_TTL) } });
  // Sent now rather than through the outbox: a sign-in link is useless by the time a drain gets to it.
  const body = `Groundwork sign-in: ${appUrl()}/login/${token} (expires in 15 minutes)`;
  await provider.send(user.phone ? { channel: 'sms', to: user.phone, body } : { channel: 'email', to: user.email!, body });
}

/** Spends a link token (once, before expiry) and returns a new session token, or null. */
export async function redeemLink(token: string, clock: Clock = systemClock) {
  const now = clock.now();
  const spent = await prisma.loginToken.updateMany({
    where: { hash: hash(token), usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (spent.count !== 1) return null;
  const { userId } = await prisma.loginToken.findUniqueOrThrow({ where: { hash: hash(token) } });
  const session = newToken();
  await prisma.session.create({ data: { hash: hash(session), userId, expiresAt: new Date(now.getTime() + SESSION_TTL) } });
  return session;
}

export async function roleFor(session: string | undefined, clock: Clock = systemClock): Promise<Role | null> {
  if (!session) return null;
  const s = await prisma.session.findUnique({ where: { hash: hash(session) }, include: { user: true } });
  if (!s || s.expiresAt <= clock.now()) return null;
  return s.user.role === 'dispatcher' ? { kind: 'dispatcher', name: s.user.name } : { kind: 'crew', crewId: s.user.crewId!, userId: s.user.id, name: s.user.name };
}

export async function endSession(session: string | undefined) {
  if (session) await prisma.session.deleteMany({ where: { hash: hash(session) } });
}

export async function setSessionCookie(session: string) {
  (await cookies()).set(SESSION_COOKIE, session, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_TTL / 1000, secure: appUrl().startsWith('https:'),
  });
}

export async function currentRole(): Promise<Role | null> {
  return roleFor((await cookies()).get(SESSION_COOKIE)?.value);
}

/** The signed-in dispatcher, or a redirect to sign-in. */
export async function requireDispatcher() {
  const r = await currentRole();
  if (r?.kind !== 'dispatcher') redirect('/');
  return r;
}

/** The crew user this session acts as, or a redirect to sign-in. */
export async function requireCrew(crewId: string) {
  const r = await currentRole();
  if (r?.kind !== 'crew' || r.crewId !== crewId) redirect('/');
  return r;
}
