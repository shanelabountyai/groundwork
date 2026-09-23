'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireDispatcher } from '@/src/session';
import { MakeUpRefused } from '@/src/visits/makeup';
import { approveReschedule, declineReschedule, ReviewRefused } from '@/src/visits/reschedule';

const text = (form: FormData, k: string) => { const v = form.get(k); return typeof v === 'string' ? v.trim() : ''; };

async function resolve(fn: () => Promise<unknown>, done: string): Promise<never> {
  let msg = done;
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof ReviewRefused || e instanceof MakeUpRefused)) throw e;
    msg = e.message;
  }
  revalidatePath('/dispatch/reschedules');
  redirect(`/dispatch/reschedules?msg=${encodeURIComponent(msg)}`);
}

export async function approveRequest(form: FormData) {
  const { name } = await requireDispatcher();
  await resolve(() => approveReschedule(text(form, 'id'), name), 'Approved and booked; the customer is queued for notice.');
}

export async function declineRequest(form: FormData) {
  await requireDispatcher();
  await resolve(() => declineReschedule(text(form, 'id'), text(form, 'note')), 'Declined; the customer sees your note in the portal.');
}
