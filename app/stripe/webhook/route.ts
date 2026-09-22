import { systemClock } from '@/src/clock';
import { applyStripeEvent, type StripeEvent } from '@/src/billing/invoice';
import { verifySignature } from '@/src/billing/stripe';

/**
 * BO-4 Stripe webhook. Unauthenticated by design — the signature is the
 * authentication, so nothing is read from the body until it verifies. A
 * throw is a 500, which Stripe retries; the event row rolls back with it.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET ?? '', systemClock)) {
    return new Response('Bad signature', { status: 400 });
  }
  const outcome = await applyStripeEvent(JSON.parse(raw) as StripeEvent, systemClock);
  return Response.json({ received: true, outcome });
}
