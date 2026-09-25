import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DAY, systemClock, type Clock } from '../clock';
import { prisma } from '../db';
import { defaultProvider, type Provider } from '../notifications/provider';
import { ipOverLimit, normalizeLogin } from '../session';

/**
 * Customer portal sign-in — same magic-link shape as src/session.ts (Phase 9),
 * scoped to a Property instead of a User: v1 has no customer account, the
 * property row *is* the customer (design-brief.md, P2 #7).
 */
export const PORTAL_COOKIE = 'groundwork_portal';
const LINK_TTL = 15 * 60_000;
const LINK_COOLDOWN = 60_000;
const SESSION_TTL = 30 * DAY;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const appUrl = () => process.env.APP_URL ?? 'http://localhost:3900';
const digits = (s: string) => s.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');

/**
 * Unlike User.phone/email, Property.customerPhone/customerEmail aren't stored
 * normalized (seed data has dashes). The phone match runs `digits` in SQL, on
 * the expression index "Property_customerPhone_digits_idx" (migration
 * link_request_ip) — keep the two expressions identical or the index goes unused.
 */
async function findProperty(login: string) {
  const key = normalizeLogin(login);
  if (!key) return null;
  if ('email' in key) return prisma.property.findFirst({ where: { customerEmail: key.email } });
  const [hit] = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Property"
    WHERE regexp_replace(regexp_replace("customerPhone", '\\D', '', 'g'), '^1(\\d{10})$', '\\1') = ${digits(key.phone)}
    LIMIT 1`;
  return hit ? prisma.property.findUnique({ where: { id: hit.id } }) : null;
}

/** Sends a portal link if `login` matches a property. Says nothing either way. */
export async function requestPortalLink(login: string, clock: Clock = systemClock, provider: Provider = defaultProvider, ip: string | null = null) {
  const now = clock.now();
  if (await ipOverLimit(ip, now)) return;
  const property = await findProperty(login);
  if (!property) return;
  if (await prisma.portalToken.count({ where: { propertyId: property.id, createdAt: { gt: new Date(now.getTime() - LINK_COOLDOWN) } } })) return;
  const token = newToken();
  await prisma.portalToken.create({ data: { hash: hash(token), propertyId: property.id, createdAt: now, expiresAt: new Date(now.getTime() + LINK_TTL), requestIp: ip } });
  const body = `Evergreen Property Care: view your schedule at ${appUrl()}/portal/${token} (expires in 15 minutes)`;
  await provider.send(property.customerEmail ? { channel: 'email', to: property.customerEmail, body } : { channel: 'sms', to: property.customerPhone, body });
}

/** Spends a link token (once, before expiry) and returns a new session token, or null. */
export async function redeemPortalLink(token: string, clock: Clock = systemClock) {
  const now = clock.now();
  const spent = await prisma.portalToken.updateMany({
    where: { hash: hash(token), usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (spent.count !== 1) return null;
  const { propertyId } = await prisma.portalToken.findUniqueOrThrow({ where: { hash: hash(token) } });
  const session = newToken();
  await prisma.portalSession.create({ data: { hash: hash(session), propertyId, expiresAt: new Date(now.getTime() + SESSION_TTL) } });
  return session;
}

export async function propertyIdFor(session: string | undefined, clock: Clock = systemClock) {
  if (!session) return null;
  const s = await prisma.portalSession.findUnique({ where: { hash: hash(session) } });
  if (!s || s.expiresAt <= clock.now()) return null;
  return s.propertyId;
}

export async function endPortalSession(session: string | undefined) {
  if (session) await prisma.portalSession.deleteMany({ where: { hash: hash(session) } });
}

export async function setPortalCookie(session: string) {
  (await cookies()).set(PORTAL_COOKIE, session, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_TTL / 1000, secure: appUrl().startsWith('https:'),
  });
}

export async function currentPropertyId(): Promise<string | null> {
  return propertyIdFor((await cookies()).get(PORTAL_COOKIE)?.value);
}

/** The property id this session acts as, or a redirect to the portal sign-in form. */
export async function requirePortalProperty() {
  const id = await currentPropertyId();
  if (!id) redirect('/portal');
  return id;
}

/** Ends every way into a property's portal: live sessions and unspent link tokens. */
export async function revokePortalAccess(propertyId: string) {
  await prisma.$transaction([
    prisma.portalSession.deleteMany({ where: { propertyId } }),
    prisma.portalToken.deleteMany({ where: { propertyId } }),
  ]);
}
