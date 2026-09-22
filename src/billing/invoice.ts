import type { Clock } from '../clock';
import { prisma } from '../db';
import type { Invoice, InvoiceStatus } from '../generated/prisma/client';
import { usd } from '../money';
import { toDbDate, type LocalDate } from '../time';
import type { Checkout } from './stripe';

/**
 * BO-4 invoicing. An invoice is one property's completed visits, priced at
 * the visits' snapshots, so its amount is fixed when it is built. The status
 * is moved only by a conditional update whose `where` names the statuses it
 * may come from — of two racing writers the second matches nothing.
 *
 * One invariant carries the money safety: **at most one Checkout Session per
 * invoice can be open, and it is the one stored on the row.** A new session
 * is opened only once Stripe confirms the stored one expired, and voiding or
 * marking paid by hand first expires it — so no customer can pay an invoice
 * the dispatcher has already closed.
 */
export class InvoiceRefused extends Error {}

const appUrl = () => process.env.APP_URL ?? 'http://localhost:3900';
const OPEN: InvoiceStatus[] = ['sent', 'payment_failed'];

export const INVOICE_STATUS: Record<InvoiceStatus, string> = {
  draft: 'Draft', sent: 'Sent', paid: 'Paid', payment_failed: 'Payment failed', refunded: 'Refunded', void: 'Void',
};

/** Completed visits in the range not already on a live invoice. */
export function invoiceableVisits(f: { from: LocalDate; to: LocalDate; crewId?: string; propertyId?: string }) {
  return prisma.visit.findMany({
    where: {
      status: 'completed', invoiceId: null,
      date: { gte: toDbDate(f.from), lte: toDbDate(f.to) },
      ...(f.crewId && { crewId: f.crewId }),
      ...(f.propertyId && { propertyId: f.propertyId }),
    },
    orderBy: [{ propertyId: 'asc' }, { date: 'asc' }],
    include: { property: true, serviceType: true, crew: true },
  });
}

/** Drafts one invoice per property among the chosen visits. */
export async function buildInvoices(visitIds: string[], createdBy: string) {
  if (visitIds.length === 0) throw new InvoiceRefused('Pick at least one visit');
  return prisma.$transaction(async (tx) => {
    const visits = await tx.visit.findMany({ where: { id: { in: visitIds }, status: 'completed', invoiceId: null } });
    if (visits.length !== new Set(visitIds).size) throw new InvoiceRefused('Some of those visits are not completed or are already invoiced; reload');

    const byProperty = new Map<string, typeof visits>();
    for (const v of visits) byProperty.set(v.propertyId, [...(byProperty.get(v.propertyId) ?? []), v]);
    const invoices: Invoice[] = [];
    for (const [propertyId, mine] of byProperty) {
      const invoice = await tx.invoice.create({
        data: { propertyId, createdBy, amountCents: mine.reduce((c, v) => c + v.priceCents, 0) },
      });
      // Conditional on still being uninvoiced, so a concurrent build cannot claim the same visit.
      const { count } = await tx.visit.updateMany({ where: { id: { in: mine.map((v) => v.id) }, invoiceId: null }, data: { invoiceId: invoice.id } });
      if (count !== mine.length) throw new InvoiceRefused('Some of those visits were invoiced on another screen; reload');
      invoices.push(invoice);
    }
    return invoices;
  });
}

async function move(
  id: string, from: InvoiceStatus[], data: Partial<Invoice>,
  db: Pick<typeof prisma, 'invoice'> = prisma, session?: Pick<Invoice, 'stripeCheckoutSessionId'>,
) {
  const { count } = await db.invoice.updateMany({ where: { id, status: { in: from }, ...session }, data });
  if (count === 0) throw new InvoiceRefused('This invoice changed on another screen; reload');
}

async function load(id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { property: true } });
  if (!invoice) throw new InvoiceRefused('No such invoice');
  return invoice;
}

/** Stripe's session, recorded as the invoice's one open session. */
const sessionFields = (s: Awaited<ReturnType<Checkout['create']>>) => ({
  stripeCheckoutSessionId: s.id, checkoutUrl: s.url, checkoutExpiresAt: new Date(s.expires_at * 1000),
});

/** Draft → sent: opens a Checkout Session and queues the link through the outbox. */
export async function sendInvoice(id: string, checkout: Checkout, clock: Clock) {
  const invoice = await load(id);
  if (invoice.status !== 'draft') throw new InvoiceRefused(`A ${invoice.status} invoice cannot be sent`);
  if (invoice.amountCents === 0) throw new InvoiceRefused('Nothing to collect on a $0.00 invoice; void it');
  const session = await checkout.create({ id, amountCents: invoice.amountCents, description: `Evergreen Property Care — ${invoice.property.address}` });
  const p = invoice.property;
  try {
    await prisma.$transaction(async (tx) => {
      await move(id, ['draft'], { status: 'sent', sentAt: clock.now(), ...sessionFields(session) }, tx);
      await tx.notification.create({
        data: {
          channel: p.customerEmail ? 'email' : 'sms',
          to: p.customerEmail ?? p.customerPhone,
          body: `Evergreen Property Care: your invoice for ${usd(invoice.amountCents)} is ready. Pay securely: ${session.url} `
            + `(good for 24 hours — after that, pay any time from ${appUrl()}/portal).`,
        },
      });
    });
  } catch (e) {
    // Lost a race with another send: that session is the invoice's, this one must not stay payable.
    await checkout.expire(session.id);
    throw e;
  }
}

/**
 * The customer's pay link: the stored session while it is open, a fresh one
 * once Stripe says it expired. Refuses when Stripe says it already completed —
 * that payment is on its way through the webhook.
 */
export async function payLink(id: string, propertyId: string, checkout: Checkout, clock: Clock) {
  const invoice = await load(id);
  if (invoice.propertyId !== propertyId || !OPEN.includes(invoice.status)) throw new InvoiceRefused('That invoice is not open');
  if (invoice.checkoutUrl && invoice.checkoutExpiresAt && invoice.checkoutExpiresAt > clock.now()) return invoice.checkoutUrl;
  if (invoice.stripeCheckoutSessionId) {
    const stored = await checkout.retrieve(invoice.stripeCheckoutSessionId);
    if (stored.status === 'complete') throw new InvoiceRefused('That payment went through; it will show here shortly');
    if (stored.status === 'open' && stored.url) return stored.url;
  }
  const session = await checkout.create({ id, amountCents: invoice.amountCents, description: `Evergreen Property Care — ${invoice.property.address}` });
  // Conditional on the session just checked, so two taps cannot both replace it.
  const { count } = await prisma.invoice.updateMany({
    where: { id, status: { in: OPEN }, stripeCheckoutSessionId: invoice.stripeCheckoutSessionId },
    data: sessionFields(session),
  });
  if (count === 0) {
    await checkout.expire(session.id);
    throw new InvoiceRefused('This invoice changed on another screen; reload');
  }
  return session.url!;
}

/**
 * Makes sure the stored session can no longer take a payment. The move that
 * follows is conditional on that same session, so a pay tap that swapped in a
 * fresh one meanwhile makes the move fail instead of leaving it open.
 */
async function closeSession(invoice: Invoice, checkout: Checkout) {
  if (!invoice.stripeCheckoutSessionId) return;
  const s = await checkout.retrieve(invoice.stripeCheckoutSessionId);
  if (s.status === 'complete') throw new InvoiceRefused('Stripe already collected this invoice — wait for its confirmation instead');
  if (s.status === 'open') await checkout.expire(s.id);
}

/** Out-of-band payment (check, cash, Venmo). The note says which. */
export async function markPaid(id: string, note: string, checkout: Checkout, clock: Clock) {
  if (!note.trim()) throw new InvoiceRefused('Say how it was paid');
  const invoice = await load(id);
  if (!OPEN.includes(invoice.status)) throw new InvoiceRefused(`A ${invoice.status} invoice cannot be marked paid`);
  await closeSession(invoice, checkout);
  await move(id, OPEN, { status: 'paid', paidAt: clock.now(), paidNote: note.trim() }, prisma, { stripeCheckoutSessionId: invoice.stripeCheckoutSessionId });
}

/** Cancels an unpaid invoice and releases its visits to be invoiced again. */
export async function voidInvoice(id: string, checkout: Checkout, clock: Clock) {
  const invoice = await load(id);
  if (!['draft', ...OPEN].includes(invoice.status)) throw new InvoiceRefused(`A ${invoice.status} invoice cannot be voided`);
  await closeSession(invoice, checkout);
  await prisma.$transaction(async (tx) => {
    await move(id, ['draft', ...OPEN], { status: 'void', voidedAt: clock.now() }, tx, { stripeCheckoutSessionId: invoice.stripeCheckoutSessionId });
    await tx.visit.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } });
  });
}

/** The slice of a Stripe event this app reads. */
export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> & { metadata?: Record<string, string> | null } };
}

/**
 * The webhook's writer, and the only writer of paid/payment_failed/refunded
 * besides a dispatcher's mark-paid. Idempotent twice over: the event id is
 * recorded in the same transaction (a redelivery changes nothing), and each
 * change is conditional on the status it comes from (so events arriving out
 * of order cannot walk a paid invoice back to failed).
 */
export async function applyStripeEvent(event: StripeEvent, clock: Clock): Promise<'applied' | 'duplicate' | 'ignored'> {
  const o = event.data.object;
  const invoiceId = o.metadata?.invoiceId ?? (o.client_reference_id as string | undefined);
  const now = clock.now();

  return prisma.$transaction(async (tx) => {
    const { count: fresh } = await tx.stripeEvent.createMany({ data: [{ id: event.id, type: event.type, receivedAt: now }], skipDuplicates: true });
    if (fresh === 0) return 'duplicate';

    let changed = 0;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        // A delayed method (bank debit) completes the session unpaid; its async_payment_succeeded follows.
        if (!invoiceId || o.payment_status !== 'paid') break;
        // Online payment is authoritative: it lands even on an invoice voided after the link went out.
        ({ count: changed } = await tx.invoice.updateMany({
          where: { id: invoiceId, status: { notIn: ['paid', 'refunded'] } },
          data: { status: 'paid', paidAt: now, paidNote: null, stripePaymentIntentId: (o.payment_intent as string | null) ?? null },
        }));
        break;
      case 'checkout.session.async_payment_failed':
      case 'payment_intent.payment_failed':
        if (!invoiceId) break;
        ({ count: changed } = await tx.invoice.updateMany({ where: { id: invoiceId, status: 'sent' }, data: { status: 'payment_failed', failedAt: now } }));
        break;
      case 'charge.refunded':
        // ponytail: full refunds only (v1 is pay-in-full); a partial refund leaves the invoice paid.
        if (o.refunded !== true || typeof o.payment_intent !== 'string') break;
        ({ count: changed } = await tx.invoice.updateMany({
          where: { stripePaymentIntentId: o.payment_intent, status: 'paid' }, data: { status: 'refunded', refundedAt: now },
        }));
        break;
    }
    return changed ? 'applied' : 'ignored';
  });
}

/** An invoice's customer-facing state, for the portal. */
export function openInvoices(propertyId: string) {
  return prisma.invoice.findMany({ where: { propertyId, status: { in: OPEN } }, orderBy: { sentAt: 'asc' } });
}
