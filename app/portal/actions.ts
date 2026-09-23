'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  currentPropertyId, endPortalSession, PORTAL_COOKIE, redeemPortalLink, requestPortalLink, setPortalCookie,
} from '@/src/portal/session';
import { InvoiceRefused, payLink } from '@/src/billing/invoice';
import { stripeCheckout, StripeNotConfigured } from '@/src/billing/stripe';
import { systemClock } from '@/src/clock';
import { RescheduleRefused, requestReschedule } from '@/src/visits/reschedule';
import { customerSkip, IllegalTransition } from '@/src/visits/status';
import { shortDay } from '@/src/time';

export async function askForPortalLink(form: FormData) {
  const login = form.get('login');
  if (typeof login === 'string') {
    try {
      await requestPortalLink(login);
    } catch (e) {
      // Same answer as success: a provider failure must not reveal the property exists.
      console.error('portal link not sent', e);
    }
  }
  redirect('/portal?sent=1');
}

export async function portalSignIn(form: FormData) {
  const token = form.get('token');
  const session = typeof token === 'string' ? await redeemPortalLink(token) : null;
  if (!session) redirect('/portal?expired=1');
  await setPortalCookie(session);
  redirect('/portal');
}

export async function portalSignOut() {
  const jar = await cookies();
  await endPortalSession(jar.get(PORTAL_COOKIE)?.value);
  jar.delete(PORTAL_COOKIE);
  redirect('/portal');
}

export async function requestSkip(form: FormData) {
  const propertyId = await currentPropertyId();
  if (!propertyId) redirect('/portal');
  const visitId = form.get('visitId');
  let msg: string | undefined;
  try {
    await customerSkip(typeof visitId === 'string' ? visitId : '', propertyId);
  } catch (e) {
    if (!(e instanceof IllegalTransition)) throw e;
    msg = e.message;
  }
  revalidatePath('/portal');
  redirect(msg ? `/portal?msg=${encodeURIComponent(msg)}` : '/portal');
}

/** Off to Stripe's hosted Checkout — the card is entered there, never here. */
export async function payInvoice(form: FormData) {
  const propertyId = await currentPropertyId();
  if (!propertyId) redirect('/portal');
  const invoiceId = form.get('invoiceId');
  let url: string;
  try {
    url = await payLink(typeof invoiceId === 'string' ? invoiceId : '', propertyId, stripeCheckout, systemClock);
  } catch (e) {
    if (!(e instanceof InvoiceRefused || e instanceof StripeNotConfigured)) throw e;
    redirect(`/portal?msg=${encodeURIComponent(e.message)}`);
  }
  redirect(url);
}

/** POST half of the reschedule confirm step. Says which of the two outcomes happened. */
export async function commitReschedule(form: FormData) {
  const propertyId = await currentPropertyId();
  if (!propertyId) redirect('/portal');
  const visitId = form.get('visitId'), date = form.get('date');
  let msg: string;
  try {
    const outcome = await requestReschedule(typeof visitId === 'string' ? visitId : '', propertyId, typeof date === 'string' ? date : '');
    msg = outcome === 'booked' ? `Moved to ${shortDay(date as string)}.` : `Request for ${shortDay(date as string)} sent — we'll confirm it.`;
  } catch (e) {
    if (!(e instanceof RescheduleRefused || e instanceof IllegalTransition)) throw e;
    msg = e.message;
  }
  revalidatePath('/portal');
  redirect(`/portal?msg=${encodeURIComponent(msg)}`);
}
