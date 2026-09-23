import { beforeEach, describe, expect, it } from 'vitest';
import { DAY, fixedClock } from '../clock';
import { prisma } from '../db';
import type { Message } from '../notifications/provider';
import { resetDb } from '../test/harness';
import { endPortalSession, propertyIdFor, redeemPortalLink, requestPortalLink, revokePortalAccess } from './session';

beforeEach(resetDb);

const outbox = () => {
  const sent: Message[] = [];
  return { sent, provider: { send: async (m: Message) => { sent.push(m); } } };
};
const tokenIn = (m: Message) => m.body.match(/\/portal\/([\w-]+)/)![1]!;

async function makeProperty(data: Partial<{ customerEmail: string | null; customerPhone: string }> = {}) {
  return prisma.property.create({
    data: {
      address: '1 Test St, Tulsa OK', lat: 36.1, lng: -95.9,
      customerName: 'Portal Customer', customerPhone: data.customerPhone ?? '918-555-0142', customerEmail: data.customerEmail,
    },
  });
}

describe('portal magic-link sign-in', () => {
  it('texts a link that signs in as that property, matching a dashed phone number loosely', async () => {
    const property = await makeProperty();
    const clock = fixedClock('2026-03-03T12:00:00Z');
    const { sent, provider } = outbox();

    await requestPortalLink('(918) 555-0142', clock, provider);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ channel: 'sms', to: '918-555-0142' });

    const token = tokenIn(sent[0]!);
    const session = await redeemPortalLink(token, clock);
    expect(await propertyIdFor(session!, clock)).toBe(property.id);
    expect(await redeemPortalLink(token, clock)).toBeNull();
    expect(await prisma.portalToken.count({ where: { hash: token } })).toBe(0);
    expect(await prisma.portalSession.count({ where: { hash: session! } })).toBe(0);
  });

  it('emails when the property has an email on file, and says nothing for an unknown login', async () => {
    await makeProperty({ customerEmail: 'owner@example.com', customerPhone: '918-555-0199' });
    const clock = fixedClock('2026-03-03T12:00:00Z');
    const { sent, provider } = outbox();
    await requestPortalLink('nobody@example.com', clock, provider);
    expect(sent).toHaveLength(0);
    await requestPortalLink('OWNER@example.com', clock, provider);
    expect(sent[0]).toMatchObject({ channel: 'email', to: 'owner@example.com' });
  });

  it('refuses an expired link and throttles repeat requests', async () => {
    await makeProperty();
    const clock = fixedClock('2026-03-03T12:00:00Z');
    const { sent, provider } = outbox();
    await requestPortalLink('918-555-0142', clock, provider);
    await requestPortalLink('918-555-0142', clock, provider);
    expect(sent).toHaveLength(1);
    clock.advance(16 * 60_000);
    expect(await redeemPortalLink(tokenIn(sent[0]!), clock)).toBeNull();
    await requestPortalLink('918-555-0142', clock, provider);
    expect(sent).toHaveLength(2);
  });

  it('ends sessions on expiry and on sign-out', async () => {
    await makeProperty();
    const clock = fixedClock('2026-03-03T12:00:00Z');
    const { sent, provider } = outbox();
    await requestPortalLink('918-555-0142', clock, provider);
    const session = (await redeemPortalLink(tokenIn(sent[0]!), clock))!;
    expect(await propertyIdFor(session, fixedClock('2026-04-01T12:00:00Z'))).not.toBeNull();
    expect(await propertyIdFor(session, fixedClock(new Date(clock.now().getTime() + 30 * DAY)))).toBeNull();
    await endPortalSession(session);
    expect(await propertyIdFor(session, clock)).toBeNull();
  });
});

describe('revokePortalAccess', () => {
  it('refuses an already-issued session and an unspent link', async () => {
    const property = await makeProperty();
    const clock = fixedClock('2026-03-03T12:00:00Z');
    const { sent, provider } = outbox();
    await requestPortalLink('918-555-0142', clock, provider);
    const session = (await redeemPortalLink(tokenIn(sent[0]!), clock))!;
    await prisma.portalToken.create({ data: { hash: 'unspent', propertyId: property.id, createdAt: clock.now(), expiresAt: new Date(clock.now().getTime() + DAY) } });
    await revokePortalAccess(property.id);
    expect(await propertyIdFor(session, clock)).toBeNull();
    expect(await prisma.portalToken.count({ where: { propertyId: property.id } })).toBe(0);
  });
});
