'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/src/db';
import { Prisma } from '@/src/generated/prisma/client';
import { backWithErrors } from '@/src/forms';
import { requireDispatcher } from '@/src/session';

const text = (form: FormData, k: string) => { const v = form.get(k); return typeof v === 'string' ? v.trim() : ''; };
const isDup = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

function back(path: string, msg?: string): never {
  revalidatePath(path);
  redirect(msg ? `${path}?msg=${encodeURIComponent(msg)}` : path);
}

function serviceTypeFields(form: FormData) {
  return { name: text(form, 'name'), estimatedMinutes: Number(text(form, 'estimatedMinutes')) };
}
function fieldErrors(d: ReturnType<typeof serviceTypeFields>) {
  const errors: Record<string, string> = {};
  if (!d.name) errors.name = 'Name is required';
  if (!Number.isInteger(d.estimatedMinutes) || d.estimatedMinutes <= 0) errors.estimatedMinutes = 'Enter a positive whole number of minutes';
  return errors;
}
const hasErrors = (e: Record<string, string>) => Object.keys(e).length > 0;

/** Editing estimatedMinutes never rewrites an already-generated visit — nothing snapshots it (CLAUDE.md rule 1's boundary is price only). */
export async function createServiceType(form: FormData) {
  await requireDispatcher();
  const data = serviceTypeFields(form);
  const errors = fieldErrors(data);
  if (hasErrors(errors)) backWithErrors('/dispatch/service-types/new', form, errors);
  try {
    const serviceType = await prisma.serviceType.create({ data });
    back('/dispatch/service-types', `${serviceType.name} created`);
  } catch (e) {
    if (isDup(e)) backWithErrors('/dispatch/service-types/new', form, { name: 'That name is already in use' });
    throw e;
  }
}

export async function updateServiceType(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  const data = serviceTypeFields(form);
  const errors = fieldErrors(data);
  if (hasErrors(errors)) backWithErrors(`/dispatch/service-types/${id}`, form, errors);
  try {
    await prisma.serviceType.update({ where: { id }, data });
    back(`/dispatch/service-types/${id}`, 'Saved');
  } catch (e) {
    if (isDup(e)) backWithErrors(`/dispatch/service-types/${id}`, form, { name: 'That name is already in use' });
    throw e;
  }
}

export async function deleteServiceType(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  const [agreements, jobs] = await Promise.all([prisma.agreement.count({ where: { serviceTypeId: id } }), prisma.job.count({ where: { serviceTypeId: id } })]);
  if (agreements + jobs > 0) back(`/dispatch/service-types/${id}`, 'Still used by an agreement or job');
  await prisma.serviceType.delete({ where: { id } });
  back('/dispatch/service-types', 'Service type deleted');
}
