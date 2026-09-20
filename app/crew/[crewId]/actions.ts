'use server';

import { rm } from 'node:fs/promises';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentRole } from '@/src/session';
import { BadPhoto, savePhoto } from '@/src/visits/photos';
import { IllegalTransition, isSkipReason, transition, type StatusEvent } from '@/src/visits/status';

const text = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : undefined);

/** Post, then redirect back (so a reload never resubmits), carrying any refusal as a message. */
async function apply(form: FormData, build: (saved: string[]) => Promise<StatusEvent>) {
  // Who is acting comes from the session, never from the form.
  const role = await currentRole();
  if (role?.kind !== 'crew') redirect('/');
  const crewId = role.crewId;
  const visitId = text(form.get('visitId')) ?? '';
  const saved: string[] = [];
  let msg: string | undefined;
  try {
    await transition(visitId, crewId, await build(saved));
  } catch (e) {
    // A refused transition must not leave its photos behind.
    await Promise.all(saved.map((p) => rm(p, { force: true })));
    if (!(e instanceof IllegalTransition || e instanceof BadPhoto)) throw e;
    msg = e.message;
  }
  const page = `/crew/${encodeURIComponent(crewId)}`;
  revalidatePath(page);
  redirect(msg ? `${page}?msg=${encodeURIComponent(msg)}` : page);
}

export async function startStop(form: FormData) {
  await apply(form, async () => ({ to: 'en_route' }));
}

export async function completeStop(form: FormData) {
  await apply(form, async (saved) => {
    const beforePhoto = await savePhoto(form.get('before'));
    if (beforePhoto) saved.push(beforePhoto);
    const afterPhoto = await savePhoto(form.get('after'));
    if (afterPhoto) saved.push(afterPhoto);
    return { to: 'completed', note: text(form.get('note')), beforePhoto, afterPhoto };
  });
}

export async function skipStop(form: FormData) {
  await apply(form, async () => {
    const reason = form.get('reason');
    if (!isSkipReason(reason)) throw new IllegalTransition('Pick a reason for the skip');
    return { to: 'skipped', reason, note: text(form.get('note')) };
  });
}
