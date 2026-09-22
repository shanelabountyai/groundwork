import { describe, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { signatureHeader, verifySignature } from './stripe';

const clock = fixedClock('2026-03-02T18:00:00Z');
const secret = 'whsec_test_secret';
const body = '{"id":"evt_1","type":"checkout.session.completed"}';

describe('verifySignature', () => {
  it('accepts what Stripe would sign, including among several v1 entries', () => {
    const h = signatureHeader(body, secret, clock);
    expect(verifySignature(body, h, secret, clock)).toBe(true);
    expect(verifySignature(body, `${h.split(',')[0]},v1=${'0'.repeat(64)},${h.split(',')[1]}`, secret, clock)).toBe(true);
  });

  it('refuses a changed body, the wrong secret, a missing header, and garbage', () => {
    const h = signatureHeader(body, secret, clock);
    expect(verifySignature(body.replace('evt_1', 'evt_2'), h, secret, clock)).toBe(false);
    expect(verifySignature(body, h, 'whsec_other', clock)).toBe(false);
    expect(verifySignature(body, null, secret, clock)).toBe(false);
    expect(verifySignature(body, h, '', clock)).toBe(false);
    expect(verifySignature(body, 't=abc,v1=zz', secret, clock)).toBe(false);
    expect(verifySignature(body, h.replace(/v1=\w+/, 'v1=abcd'), secret, clock)).toBe(false);
  });

  it('refuses a signature older (or newer) than five minutes — a replay', () => {
    const h = signatureHeader(body, secret, clock);
    const later = fixedClock(clock.now());
    later.advance(299_000);
    expect(verifySignature(body, h, secret, later)).toBe(true);
    later.advance(2_000);
    expect(verifySignature(body, h, secret, later)).toBe(false);
    const earlier = fixedClock(clock.now());
    earlier.advance(-301_000);
    expect(verifySignature(body, h, secret, earlier)).toBe(false);
  });
});
