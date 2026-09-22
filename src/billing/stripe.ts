import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Clock } from '../clock';

/**
 * Stripe over plain fetch + node:crypto, no SDK: the app makes three calls
 * and checks one signature. Doing the check here also lets its replay window
 * read the injected clock (rule 2) instead of the SDK's Date.now().
 *
 * Card data never touches this app: the customer pays on Stripe's hosted
 * Checkout page, and all that comes back is the webhook event.
 */
export interface CheckoutSession {
  id: string;
  url: string | null;
  status: 'open' | 'complete' | 'expired';
  /** Unix seconds. */
  expires_at: number;
}

export interface Checkout {
  create(invoice: { id: string; amountCents: number; description: string }): Promise<CheckoutSession>;
  retrieve(sessionId: string): Promise<CheckoutSession>;
  expire(sessionId: string): Promise<CheckoutSession>;
}

export class StripeNotConfigured extends Error {}

const appUrl = () => process.env.APP_URL ?? 'http://localhost:3900';

async function call(method: 'GET' | 'POST', path: string, body?: URLSearchParams): Promise<CheckoutSession> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeNotConfigured('Stripe is not configured (STRIPE_SECRET_KEY)');
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) throw new Error(`Stripe ${method} ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export const stripeCheckout: Checkout = {
  create: (invoice) => call('POST', 'checkout/sessions', new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(invoice.amountCents),
    'line_items[0][price_data][product_data][name]': invoice.description,
    client_reference_id: invoice.id,
    'metadata[invoiceId]': invoice.id,
    // The payment intent carries it too, so payment_intent.payment_failed can find the invoice.
    'payment_intent_data[metadata][invoiceId]': invoice.id,
    success_url: `${appUrl()}/portal?paid=1`,
    cancel_url: `${appUrl()}/portal`,
  })),
  retrieve: (id) => call('GET', `checkout/sessions/${encodeURIComponent(id)}`),
  expire: (id) => call('POST', `checkout/sessions/${encodeURIComponent(id)}/expire`),
};

/** Stripe's default: an event signed more than five minutes ago is refused as a possible replay. */
const TOLERANCE_S = 300;

/**
 * The `Stripe-Signature` check: HMAC-SHA256 of `${t}.${rawBody}` under the
 * endpoint's signing secret, against any `v1=` entry, constant-time, with the
 * timestamp inside the tolerance. The raw body, byte for byte — re-serialized
 * JSON would not match.
 */
export function verifySignature(rawBody: string, header: string | null, secret: string, clock: Clock): boolean {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.split('=') as [string, string?]);
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  if (!Number.isInteger(t) || Math.abs(clock.now().getTime() / 1000 - t) > TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  return parts.some(([k, v]) => {
    if (k !== 'v1' || !v || !/^[0-9a-f]{64}$/.test(v)) return false;
    return timingSafeEqual(expected, Buffer.from(v, 'hex'));
  });
}

/** What Stripe would send for `rawBody` at the clock's now — for tests and fixture replays. */
export function signatureHeader(rawBody: string, secret: string, clock: Clock) {
  const t = Math.floor(clock.now().getTime() / 1000);
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')}`;
}
