'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { systemClock } from '@/src/clock';
import { CapacityExceeded } from '@/src/crews/capacity';
import { MessageRefused, messageCrewDay, messageProperty } from '@/src/notifications/announce';
import { autoOrderRoute, reorderRoute, routeFor } from '@/src/routes/day';
import { requireDispatcher } from '@/src/session';
import { shortDay } from '@/src/time';
import { CascadeRefused, commitCascade, type Resolution } from '@/src/visits/cascade';
import { bookMakeUp, MakeUpRefused } from '@/src/visits/makeup';

const text = (form: FormData, k: string) => { const v = form.get(k); return typeof v === 'string' ? v : ''; };

const dayPath = (crewId: string, date: string) => `/dispatch/${encodeURIComponent(crewId)}/${date}`;

/** Post, then redirect (a reload never resubmits), carrying any refusal as a message. */
function back(path: string, msg?: string, query: Record<string, string> = {}): never {
  revalidatePath(path);
  const q = new URLSearchParams({ ...query, ...(msg ? { msg } : {}) });
  redirect([path, q.toString()].filter(Boolean).join('?'));
}

/** One step up or down. The first move is what makes the day the dispatcher's. */
export async function moveStop(form: FormData) {
  await requireDispatcher();
  const crewId = text(form, 'crewId'), date = text(form, 'date'), visitId = text(form, 'visitId');
  const { stops } = await routeFor(crewId, date);
  const order = stops.map((s) => s.id);
  const i = order.indexOf(visitId);
  const j = text(form, 'dir') === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= order.length) back(dayPath(crewId, date), 'That stop moved; check the day again');
  [order[i]!, order[j]!] = [order[j]!, order[i]!];
  await reorderRoute(crewId, date, order);
  back(dayPath(crewId, date));
}

export async function autoOrder(form: FormData) {
  await requireDispatcher();
  const crewId = text(form, 'crewId'), date = text(form, 'date');
  await autoOrderRoute(crewId, date);
  back(dayPath(crewId, date), 'Auto-order is back on for this day');
}

/** P1-1: take the offered slot for a skipped stop. The day is re-checked inside. */
export async function bookMakeUpStop(form: FormData) {
  await requireDispatcher();
  const crewId = text(form, 'crewId'), date = text(form, 'date');
  const visitId = text(form, 'visitId'), on = text(form, 'on');

  // Redirects throw, so the booking and only the booking sits inside the try.
  try {
    await bookMakeUp(visitId, on);
  } catch (e) {
    if (e instanceof CapacityExceeded) back(dayPath(crewId, date), `${e.message}. That day filled up — check the offer again.`);
    if (!(e instanceof MakeUpRefused)) throw e;
    back(dayPath(crewId, date), e.message);
  }
  back(dayPath(crewId, date), `Make-up booked for ${shortDay(on)}; the customer is queued for notice.`);
}

/** Commit a previewed rain-day push. Everything it needs is in the preview form. */
export async function pushDay(form: FormData) {
  await requireDispatcher();
  const crewId = text(form, 'crewId'), date = text(form, 'date');
  const target = text(form, 'target'), reason = text(form, 'reason');
  const expect = form.getAll('expect').filter((v): v is string => typeof v === 'string');
  const choices = Object.fromEntries(
    expect.map((id) => [id, text(form, `r:${id}`) === 'further' ? 'further' : 'keep'] as const),
  ) as Record<string, Resolution>;
  const preview = `${dayPath(crewId, date)}/push`;

  // Redirects throw, so the commit and only the commit sits inside the try.
  let done: { msg: string; week: string };
  try {
    const r = await commitCascade(systemClock, crewId, date, target, choices, {
      expect,
      override: reason.trim() ? { reason: reason.trim(), by: 'dispatcher' } : undefined,
    });
    done = {
      msg: `Pushed ${r.moved} stops off ${date} to ${r.to}; ${r.moved} customers queued for notice${r.overridden.length ? `. Over capacity on ${r.overridden.join(', ')} — override logged` : ''}.`,
      week: r.to,
    };
  } catch (e) {
    if (e instanceof CapacityExceeded) back(preview, `${e.message}. Give a reason to override.`, { target });
    if (!(e instanceof CascadeRefused)) throw e;
    back(preview, e.message, { target });
  }
  back('/dispatch', done.msg, { week: done.week });
}

/** BO-7: queue one message to the crew's remaining customers for the day, or to one customer. */
async function send(path: string, fn: () => Promise<number>, noun: string): Promise<never> {
  try {
    const n = await fn();
    back(path, `Queued for ${n} ${noun}${n === 1 ? '' : 's'}`);
  } catch (e) {
    if (e instanceof MessageRefused) back(path, e.message);
    throw e;
  }
}

export async function messageDay(form: FormData) {
  await requireDispatcher();
  const crewId = text(form, 'crewId'), date = text(form, 'date');
  await send(dayPath(crewId, date), () => messageCrewDay(crewId, date, text(form, 'body')), 'customer');
}

export async function messageOne(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  await send(`/dispatch/properties/${id}`, () => messageProperty(id, text(form, 'body')), 'customer');
}
