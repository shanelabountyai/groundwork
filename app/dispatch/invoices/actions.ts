'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { systemClock } from '@/src/clock';
import { buildInvoices, InvoiceRefused, markPaid, sendInvoice, voidInvoice } from '@/src/billing/invoice';
import { stripeCheckout, StripeNotConfigured } from '@/src/billing/stripe';
import { requireDispatcher } from '@/src/session';

const text = (form: FormData, k: string) => { const v = form.get(k); return typeof v === 'string' ? v.trim() : ''; };

function back(path: string, msg?: string): never {
  revalidatePath(path);
  redirect(msg ? `${path}${path.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}` : path);
}

/** Refusals go back to the page as a message; anything else is a real error. */
async function attempt(path: string, done: string, fn: () => Promise<unknown>): Promise<never> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof InvoiceRefused || e instanceof StripeNotConfigured) back(path, e.message);
    throw e;
  }
  back(path, done);
}

export async function buildInvoicesAction(form: FormData) {
  const { name } = await requireDispatcher();
  const ids = form.getAll('visitId').filter((v): v is string => typeof v === 'string');
  let count = 0;
  try {
    count = (await buildInvoices(ids, name)).length;
  } catch (e) {
    if (e instanceof InvoiceRefused) back(`/dispatch/invoices/new?${text(form, 'filter')}`, e.message);
    throw e;
  }
  back('/dispatch/invoices', `${count} draft invoice${count === 1 ? '' : 's'} created`);
}

export async function sendInvoiceAction(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  await attempt(`/dispatch/invoices/${id}`, 'Sent — the pay link is in the outbox', () => sendInvoice(id, stripeCheckout, systemClock));
}

export async function markPaidAction(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  await attempt(`/dispatch/invoices/${id}`, 'Marked paid', () => markPaid(id, text(form, 'note'), stripeCheckout, systemClock));
}

export async function voidInvoiceAction(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  await attempt(`/dispatch/invoices/${id}`, 'Voided — its visits can be invoiced again', () => voidInvoice(id, stripeCheckout, systemClock));
}
