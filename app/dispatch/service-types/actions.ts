'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/src/db';
import { Prisma } from '@/src/generated/prisma/client';
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
const invalid = (d: ReturnType<typeof serviceTypeFields>) => !d.name || !Number.isInteger(d.estimatedMinutes) || d.estimatedMinutes <= 0;

/** Editing estimatedMinutes never rewrites an already-generated visit — nothing snapshots it (CLAUDE.md rule 1's boundary is price only). */
export async function createServiceType(form: FormData) {
  await requireDispatcher();
  const data = serviceTypeFields(form);
  if (invalid(data)) back('/dispatch/service-types/new', 'Name and a positive whole-minute estimate are required');
  try {
    const serviceType = await prisma.serviceType.create({ data });
    back('/dispatch/service-types', `${serviceType.name} created`);
  } catch (e) {
    if (isDup(e)) back('/dispatch/service-types/new', 'That name is already in use');
    throw e;
  }
}

export async function updateServiceType(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  const data = serviceTypeFields(form);
  if (invalid(data)) back(`/dispatch/service-types/${id}`, 'Name and a positive whole-minute estimate are required');
  try {
    await prisma.serviceType.update({ where: { id }, data });
    back(`/dispatch/service-types/${id}`, 'Saved');
  } catch (e) {
    if (isDup(e)) back(`/dispatch/service-types/${id}`, 'That name is already in use');
    throw e;
  }
}

export async function deleteServiceType(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  const agreements = await prisma.agreement.count({ where: { serviceTypeId: id } });
  if (agreements > 0) back(`/dispatch/service-types/${id}`, 'Still used by an agreement');
  await prisma.serviceType.delete({ where: { id } });
  back('/dispatch/service-types', 'Service type deleted');
}
