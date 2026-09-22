import { beforeEach, describe, expect, it } from 'vitest';
import { DAY, fixedClock } from './clock';
import { prisma } from './db';
import type { Message } from './notifications/provider';
import { endSession, normalizeLogin, redeemLink, requestLink, roleFor } from './session';
import { makeCrew, resetDb } from './test/harness';

beforeEach(resetDb);

const outbox = () => {
  const sent: Message[] = [];
  return { sent, provider: { send: async (m: Message) => { sent.push(m); } } };
};
const tokenIn = (m: Message) => m.body.match(/\/login\/([\w-]+)/)![1]!;

describe('normalizeLogin', () => {
  it('lowercases email and puts US numbers in E.164', () => {
    expect(normalizeLogin(' Dispatch@Evergreen.Example ')).toEqual({ email: 'dispatch@evergreen.example' });
    expect(normalizeLogin('(918) 555-0142')).toEqual({ phone: '+19185550142' });
    expect(normalizeLogin('1-918-555-0142')).toEqual({ phone: '+19185550142' });
    expect(normalizeLogin('+44 20 7946 0958')).toEqual({ phone: '+442079460958' });
    expect(normalizeLogin('555-0142')).toBeNull();
    expect(normalizeLogin('not an email@')).toBeNull();
  });
});

describe('magic-link sign-in', () => {
  it('texts a crew lead a single-use link that signs them in as their crew', async () => {
    const crew = await makeCrew();
    await prisma.user.create({ data: { name: 'Lead', phone: '+19185550142', role: 'crew', crewId: crew.id } });
    const clock = fixedClock('2026-03-03T12:00:00Z');
    const { sent, provider } = outbox();

    await requestLink('918-555-0142', clock, provider);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ channel: 'sms', to: '+19185550142' });

    const token = tokenIn(sent[0]!);
    const session = await redeemLink(token, clock);
    expect(await roleFor(session!, clock)).toEqual({ kind: 'crew', crewId: crew.id });
    expect(await redeemLink(token, clock)).toBeNull();
    // Neither raw token is in the database.
    expect(await prisma.loginToken.count({ where: { hash: token } })).toBe(0);
    expect(await prisma.session.count({ where: { hash: session! } })).toBe(0);
  });

  it('emails a dispatcher, and says nothing for an unknown login', async () => {
    await prisma.user.create({ data: { name: 'Office', email: 'dispatch@evergreen.example', role: 'dispatcher' } });
    const clock = fixedClock('2026-03-03T12:00:00Z');
    const { sent, provider } = outbox();
    await requestLink('nobody@evergreen.example', clock, provider);
    expect(sent).toHaveLength(0);
    await requestLink('DISPATCH@evergreen.example', clock, provider);
    expect(sent[0]).toMatchObject({ channel: 'email', to: 'dispatch@evergreen.example' });
    expect(await roleFor((await redeemLink(tokenIn(sent[0]!), clock))!, clock)).toMatchObject({ kind: 'dispatcher' });
  });

  it('refuses an expired link and throttles repeat requests', async () => {
    await prisma.user.create({ data: { name: 'Office', email: 'd@e.example', role: 'dispatcher' } });
    const clock = fixedClock('2026-03-03T12:00:00Z');
    const { sent, provider } = outbox();
    await requestLink('d@e.example', clock, provider);
    await requestLink('d@e.example', clock, provider);
    expect(sent).toHaveLength(1);
    clock.advance(16 * 60_000);
    expect(await redeemLink(tokenIn(sent[0]!), clock)).toBeNull();
    await requestLink('d@e.example', clock, provider);
    expect(sent).toHaveLength(2);
  });

  it('ends sessions on expiry and on sign-out', async () => {
    await prisma.user.create({ data: { name: 'Office', email: 'd@e.example', role: 'dispatcher' } });
    const clock = fixedClock('2026-03-03T12:00:00Z');
    const { sent, provider } = outbox();
    await requestLink('d@e.example', clock, provider);
    const session = (await redeemLink(tokenIn(sent[0]!), clock))!;
    expect(await roleFor(session, fixedClock('2026-04-01T12:00:00Z'))).not.toBeNull();
    expect(await roleFor(session, fixedClock(new Date(clock.now().getTime() + 30 * DAY)))).toBeNull();
    await endSession(session);
    expect(await roleFor(session, clock)).toBeNull();
  });

  it('the database refuses a crew user with no crew, or a raw phone number', async () => {
    await expect(prisma.user.create({ data: { name: 'x', email: 'x@e.example', role: 'crew' } })).rejects.toThrow();
    await expect(prisma.user.create({ data: { name: 'y', phone: '918-555-0142', role: 'dispatcher' } })).rejects.toThrow();
  });
});
