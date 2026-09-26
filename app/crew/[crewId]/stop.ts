import { revalidatePath } from 'next/cache';
import { currentRole } from '@/src/session';
import { prisma } from '@/src/db';
import { BadPhoto, defaultPhotoStore } from '@/src/visits/photos';
import { IllegalTransition, transition, type StatusEvent } from '@/src/visits/status';

/**
 * Applies one stop transition and returns where to send the phone next (so a
 * reload never resubmits), carrying any refusal as a message. Shared by the
 * server actions and the photo upload route, which is not an action (SEC-05).
 */
export async function applyStop(form: FormData, build: (saved: string[]) => Promise<StatusEvent>): Promise<string> {
  // Who is acting comes from the session, never from the form.
  const role = await currentRole();
  if (role?.kind !== 'crew') return '/';
  const crewId = role.crewId;
  const visitId = typeof form.get('visitId') === 'string' ? (form.get('visitId') as string) : '';
  const saved: string[] = [];
  let msg: string | undefined;
  try {
    // Before any bytes are stored: a stop that is not this crew's gets no upload.
    if (!(await prisma.visit.count({ where: { id: visitId, crewId } }))) throw new IllegalTransition('No such stop on this crew');
    await transition(visitId, crewId, await build(saved));
  } catch (e) {
    // A refused transition must not leave its photos behind.
    await Promise.all(saved.map((p) => defaultPhotoStore.remove(p)));
    if (!(e instanceof IllegalTransition || e instanceof BadPhoto)) throw e;
    msg = e.message;
  }
  const page = `/crew/${encodeURIComponent(crewId)}`;
  revalidatePath(page);
  return msg ? `${page}?msg=${encodeURIComponent(msg)}` : page;
}
