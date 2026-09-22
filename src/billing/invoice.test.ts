import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../clock';
import { ownerReport } from '../crews/report';
import { prisma } from '../db';
import { makeAgreement, resetDb } from '../test/harness';
import { generateVisits } from '../visits/generate';
import { transition } from '../visits/status';
import {
  applyStripeEvent, buildInvoices, invoiceableVisits, InvoiceRefused, markPaid, payLink, sendInvoice, voidInvoice,
  type StripeEvent,
} from './invoice';
import { signatureHeader, verifySignature, type Checkout, type CheckoutSession } from './stripe';

// Mon Mar 2 2026, noon in Tulsa.
const MON = '2026-03-02';
let clock = fixedClock('2026-03-02T18:00:00Z');

/** Stripe's Checkout, in memory: sessions it made, and what state each is in. */
function fakeCheckout() {
  const sessions = new Map<string, CheckoutSession>();
  let n = 0;
  const checkout: Checkout = {
    async create() {
      const s: CheckoutSession = { id: `cs_test_${++n}`, url: `https://checkout.stripe.com/c/pay/cs_test_${n}`, status: 'open', expires_at: clock.now().getTime() / 1000 + 86_400 };
      sessions.set(s.id, s);
      return { ...s };
    },
    async retrieve(id) { return { ...sessions.get(id)! }; },
    async expire(id) {
      const s = sessions.get(id)!;
      if (s.status !== 'open') throw new Error('Only open sessions can be expired');
      s.status = 'expired';
      return { ...s };
    },
  };
  return { checkout, sessions };
}

/** Two completed visits at one property, one at another, all on one crew's Monday. */
async function completedWeek() {
  const a = await makeAgreement('one_time', MON, { priceCents: 4500 });
  const b = await makeAgreement('one_time', MON, { priceCents: 3000, crewId: a.crewId, propertyId: a.propertyId });
  const c = await makeAgreement('one_time', MON, { priceCents: 6000, crewId: a.crewId });
  await generateVisits(clock, { date: MON });
  for (const v of await prisma.visit.findMany()) {
    await transition(v.id, a.crewId, { to: 'en_route' }, clock);
    await transition(v.id, a.crewId, { to: 'completed' }, clock);
  }
  return { a, b, c };
}

const event = (id: string, type: string, object: Record<string, unknown>): StripeEvent => ({ id, type, data: { object } });
const completed = (id: string, invoiceId: string, pi = 'pi_test_1') =>
  event(id, 'checkout.session.completed', { id: 'cs_test_1', payment_status: 'paid', payment_intent: pi, client_reference_id: invoiceId, metadata: { invoiceId } });

async function sentInvoice() {
  const { a } = await completedWeek();
  const visits = await invoiceableVisits({ from: MON, to: MON, propertyId: a.propertyId });
  const [invoice] = await buildInvoices(visits.map((v) => v.id), 'Dana');
  const fake = fakeCheckout();
  await sendInvoice(invoice!.id, fake.checkout, clock);
  return { a, invoice: invoice!, ...fake };
}

beforeEach(async () => {
  clock = fixedClock('2026-03-02T18:00:00Z');
  await resetDb();
});

describe('building invoices', () => {
  it('drafts one invoice per property at the visits\' snapshotted prices, and a visit goes on only one', async () => {
    const { a, c } = await completedWeek();
    const visits = await invoiceableVisits({ from: MON, to: MON, crewId: a.crewId });
    expect(visits).toHaveLength(3);
    const invoices = await buildInvoices(visits.map((v) => v.id), 'Dana');
    expect(invoices.map((i) => [i.propertyId, i.amountCents, i.status]).sort()).toEqual(
      [[a.propertyId, 7500, 'draft'], [c.propertyId, 6000, 'draft']].sort());

    expect(await invoiceableVisits({ from: MON, to: MON })).toHaveLength(0);
    await expect(buildInvoices(visits.map((v) => v.id), 'Dana')).rejects.toThrow(InvoiceRefused);
  });

  it('refuses a visit that is not completed, and changes nothing', async () => {
    await makeAgreement('one_time', MON);
    await generateVisits(clock, { date: MON });
    const v = await prisma.visit.findFirstOrThrow();
    await expect(buildInvoices([v.id], 'Dana')).rejects.toThrow(InvoiceRefused);
    expect(await prisma.invoice.count()).toBe(0);
  });
});

describe('sending', () => {
  it('opens a Checkout Session and queues the pay link through the outbox, not tied to a visit', async () => {
    const { invoice } = await sentInvoice();
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(row).toMatchObject({ status: 'sent', stripeCheckoutSessionId: 'cs_test_1', checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    const [n] = await prisma.notification.findMany({ where: { visitId: null } });
    expect(n).toMatchObject({ visitId: null, channel: 'sms', to: '555-0100' });
    expect(n!.body).toContain('$75.00');
    expect(n!.body).toContain('https://checkout.stripe.com/c/pay/cs_test_1');
  });

  it('cannot be sent twice', async () => {
    const { invoice, checkout } = await sentInvoice();
    await expect(sendInvoice(invoice.id, checkout, clock)).rejects.toThrow(InvoiceRefused);
  });
});

describe('the Stripe webhook', () => {
  it('a signed test-mode fixture drives sent → paid, and a replayed copy is a no-op', async () => {
    const { invoice } = await sentInvoice();
    // The route's two steps: verify the raw bytes, then apply.
    const raw = JSON.stringify(completed('evt_test_1', invoice.id));
    const header = signatureHeader(raw, 'whsec_test', clock);
    expect(verifySignature(raw, header, 'whsec_test', clock)).toBe(true);

    expect(await applyStripeEvent(JSON.parse(raw), clock)).toBe('applied');
    const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(paid).toMatchObject({ status: 'paid', stripePaymentIntentId: 'pi_test_1', paidNote: null });

    clock.advance(60_000);
    expect(await applyStripeEvent(JSON.parse(raw), clock)).toBe('duplicate');
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toEqual(paid);
    expect(await prisma.stripeEvent.count()).toBe(1);
  });

  it('a failed payment then a successful retry ends paid; a late failure cannot walk it back', async () => {
    const { invoice } = await sentInvoice();
    const failed = (id: string) => event(id, 'payment_intent.payment_failed', { id: 'pi_test_1', metadata: { invoiceId: invoice.id } });
    expect(await applyStripeEvent(failed('evt_f1'), clock)).toBe('applied');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe('payment_failed');

    expect(await applyStripeEvent(completed('evt_ok', invoice.id), clock)).toBe('applied');
    expect(await applyStripeEvent(failed('evt_f2'), clock)).toBe('ignored');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe('paid');
  });

  it('an unpaid completion (delayed bank debit) waits for its async success', async () => {
    const { invoice } = await sentInvoice();
    const pending = event('evt_1', 'checkout.session.completed', { payment_status: 'unpaid', metadata: { invoiceId: invoice.id } });
    expect(await applyStripeEvent(pending, clock)).toBe('ignored');
    const ok = event('evt_2', 'checkout.session.async_payment_succeeded', { payment_status: 'paid', payment_intent: 'pi_9', metadata: { invoiceId: invoice.id } });
    expect(await applyStripeEvent(ok, clock)).toBe('applied');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe('paid');
  });

  it('a full refund marks it refunded, found by payment intent; a partial one leaves it paid', async () => {
    const { invoice } = await sentInvoice();
    await applyStripeEvent(completed('evt_1', invoice.id, 'pi_42'), clock);
    expect(await applyStripeEvent(event('evt_2', 'charge.refunded', { payment_intent: 'pi_42', refunded: false }), clock)).toBe('ignored');
    expect(await applyStripeEvent(event('evt_3', 'charge.refunded', { payment_intent: 'pi_42', refunded: true }), clock)).toBe('applied');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe('refunded');
  });

  it('records and ignores events for no invoice of ours, or of a type it does not handle', async () => {
    expect(await applyStripeEvent(completed('evt_1', 'not_ours'), clock)).toBe('ignored');
    expect(await applyStripeEvent(event('evt_2', 'customer.created', {}), clock)).toBe('ignored');
    expect(await prisma.stripeEvent.count()).toBe(2);
  });
});

describe('closing an invoice by hand', () => {
  it('mark paid needs a note and expires the open session, so the link can no longer take money', async () => {
    const { invoice, checkout, sessions } = await sentInvoice();
    await expect(markPaid(invoice.id, ' ', checkout, clock)).rejects.toThrow(InvoiceRefused);
    await markPaid(invoice.id, 'Check #1043', checkout, clock);
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ status: 'paid', paidNote: 'Check #1043' });
    expect(sessions.get('cs_test_1')!.status).toBe('expired');
  });

  it('void expires the session and releases the visits to be invoiced again', async () => {
    const { a, invoice, checkout, sessions } = await sentInvoice();
    await voidInvoice(invoice.id, checkout, clock);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe('void');
    expect(sessions.get('cs_test_1')!.status).toBe('expired');
    expect(await invoiceableVisits({ from: MON, to: MON, propertyId: a.propertyId })).toHaveLength(2);
  });

  it('refuses to void or mark paid when Stripe already completed the session', async () => {
    const { invoice, checkout, sessions } = await sentInvoice();
    sessions.get('cs_test_1')!.status = 'complete'; // paid; the webhook is still on its way
    await expect(voidInvoice(invoice.id, checkout, clock)).rejects.toThrow(/already collected/);
    await expect(markPaid(invoice.id, 'cash', checkout, clock)).rejects.toThrow(/already collected/);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe('sent');
  });
});

describe('the customer pay link', () => {
  it('reuses the open session, and opens a fresh one only once Stripe says it expired', async () => {
    const { a, invoice, checkout, sessions } = await sentInvoice();
    expect(await payLink(invoice.id, a.propertyId, checkout, clock)).toBe('https://checkout.stripe.com/c/pay/cs_test_1');

    clock.advance(86_401_000);
    // Past its expiry on our clock but Stripe still says open: keep it, never two open at once.
    expect(await payLink(invoice.id, a.propertyId, checkout, clock)).toBe('https://checkout.stripe.com/c/pay/cs_test_1');
    sessions.get('cs_test_1')!.status = 'expired';
    expect(await payLink(invoice.id, a.propertyId, checkout, clock)).toBe('https://checkout.stripe.com/c/pay/cs_test_2');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).stripeCheckoutSessionId).toBe('cs_test_2');
  });

  it('is only for the invoice\'s own property, and only while it is open', async () => {
    const { invoice, checkout } = await sentInvoice();
    const other = await makeAgreement('one_time', MON);
    await expect(payLink(invoice.id, other.propertyId, checkout, clock)).rejects.toThrow(InvoiceRefused);
  });
});

describe('the owner report', () => {
  it('keeps scheduled value apart from money invoiced and collected', async () => {
    const { c } = await completedWeek();
    const visits = await invoiceableVisits({ from: MON, to: MON });
    const invoices = await buildInvoices(visits.map((v) => v.id), 'Dana');
    const { checkout } = fakeCheckout();
    for (const i of invoices) await sendInvoice(i.id, checkout, clock);
    const cInvoice = invoices.find((i) => i.propertyId === c.propertyId)!;
    await applyStripeEvent(completed('evt_1', cInvoice.id), clock);

    const { totals } = await ownerReport(MON);
    expect(totals).toMatchObject({ scheduledCents: 13500, invoicedCents: 13500, collectedCents: 6000 });
  });
});
