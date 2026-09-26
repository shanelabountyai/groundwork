'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ClockRefused, clockIn, clockOut } from '@/src/crews/timesheet';
import { currentRole } from '@/src/session';
import { IllegalTransition, isSkipReason, type StatusEvent } from '@/src/visits/status';
import { applyStop } from './stop';

const text = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : undefined);

async function apply(form: FormData, build: (saved: string[]) => Promise<StatusEvent>) {
  redirect(await applyStop(form, build));
}

export async function startStop(form: FormData) {
  await apply(form, async () => ({ to: 'en_route' }));
}

export async function skipStop(form: FormData) {
  await apply(form, async () => {
    const reason = form.get('reason');
    if (!isSkipReason(reason)) throw new IllegalTransition('Pick a reason for the skip');
    return { to: 'skipped', reason, note: text(form.get('note')) };
  });
}

/** BO-8: each person clocks themselves — the user comes from the session, never the form. */
async function punch(act: (role: { userId: string; name: string; crewId: string }) => Promise<unknown>) {
  const role = await currentRole();
  if (role?.kind !== 'crew') redirect('/');
  let msg: string | undefined;
  try {
    await act(role);
  } catch (e) {
    if (!(e instanceof ClockRefused)) throw e;
    msg = e.message;
  }
  const page = `/crew/${encodeURIComponent(role.crewId)}`;
  revalidatePath(page);
  redirect(msg ? `${page}?msg=${encodeURIComponent(msg)}` : page);
}

export async function clockInAction() {
  await punch((r) => clockIn(r));
}

export async function clockOutAction() {
  await punch((r) => clockOut(r.userId));
}
