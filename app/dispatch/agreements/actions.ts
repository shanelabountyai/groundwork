'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { systemClock } from '@/src/clock';
import { parseCents } from '@/src/money';
import { requireDispatcher } from '@/src/session';
import type { Frequency } from '@/src/visits/recurrence';
import { createAgreement, editAgreement } from '@/src/visits/generate';

const text = (form: FormData, k: string) => { const v = form.get(k); return typeof v === 'string' ? v.trim() : ''; };
const FREQUENCIES = new Set<Frequency>(['weekly', 'biweekly', 'every_4_weeks', 'one_time']);
const isFrequency = (v: string): v is Frequency => FREQUENCIES.has(v as Frequency);

function back(path: string, msg?: string): never {
  revalidatePath(path);
  redirect(msg ? `${path}?msg=${encodeURIComponent(msg)}` : path);
}

/** BO-2: creating an agreement generates its visits into the horizon immediately — no wait for the next scheduled run. */
export async function createAgreementAction(form: FormData) {
  await requireDispatcher();
  const propertyId = text(form, 'propertyId');
  const frequency = text(form, 'frequency');
  const priceCents = parseCents(text(form, 'priceCents'));
  const startDate = text(form, 'startDate');
  const propertyPath = `/dispatch/properties/${propertyId}`;
  if (!isFrequency(frequency) || priceCents === null || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    back(`/dispatch/agreements/new?propertyId=${propertyId}`, 'Check the frequency, price, and start date');
  }
  const { created } = await createAgreement(systemClock, {
    propertyId, serviceTypeId: text(form, 'serviceTypeId'), crewId: text(form, 'crewId'), frequency, priceCents, startDate,
  });
  back(propertyPath, `Agreement created — ${created} visit${created === 1 ? '' : 's'} on the board`);
}

/** Only frequency, crew, and price change here — CLAUDE.md rule 1: existing history is never rewritten. */
export async function updateAgreementAction(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  const propertyId = text(form, 'propertyId');
  const frequency = text(form, 'frequency');
  const priceCents = parseCents(text(form, 'priceCents'));
  const path = `/dispatch/agreements/${id}`;
  if (!isFrequency(frequency) || priceCents === null) back(path, 'Check the frequency and price');
  await editAgreement(systemClock, id, { frequency, crewId: text(form, 'crewId'), priceCents });
  back(`/dispatch/properties/${propertyId}`, 'Saved');
}

export async function togglePauseAction(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  const propertyId = text(form, 'propertyId');
  const paused = text(form, 'paused') === 'true';
  await editAgreement(systemClock, id, { paused });
  back(`/dispatch/properties/${propertyId}`, paused ? 'Paused' : 'Resumed');
}
