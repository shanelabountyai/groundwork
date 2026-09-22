'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { systemClock } from '@/src/clock';
import { placeJob, PlacementRefused } from '@/src/jobs/place';
import { parseCents } from '@/src/money';
import { requireDispatcher } from '@/src/session';

const text = (form: FormData, k: string) => { const v = form.get(k); return typeof v === 'string' ? v.trim() : ''; };

function back(path: string, msg?: string): never {
  revalidatePath(path);
  redirect(msg ? `${path}${path.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}` : path);
}

/** BO-3 fast path: lands on the crew-day the job was placed on. */
export async function placeJobAction(form: FormData) {
  const { name } = await requireDispatcher();
  const [propertyId, serviceTypeId, crewId, date] = ['propertyId', 'serviceTypeId', 'crewId', 'date'].map((k) => text(form, k));
  const priceCents = parseCents(text(form, 'priceCents'));
  const retry = `/dispatch/jobs/new?${new URLSearchParams({ propertyId: propertyId!, crewId: crewId!, date: date! })}`;
  if (priceCents === null) back(retry, 'Check the price');
  try {
    await placeJob(systemClock, { propertyId: propertyId!, serviceTypeId: serviceTypeId!, crewId: crewId!, date: date!, priceCents, createdBy: name });
  } catch (e) {
    if (e instanceof PlacementRefused) back(retry, e.message);
    throw e;
  }
  back(`/dispatch/${crewId}/${date}`, 'One-off job placed');
}
