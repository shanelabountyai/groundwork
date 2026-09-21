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

function crewFields(form: FormData) {
  return {
    name: text(form, 'name'),
    homeLat: Number(text(form, 'homeLat')),
    homeLng: Number(text(form, 'homeLng')),
    maxStops: Number(text(form, 'maxStops')),
    maxMinutes: Number(text(form, 'maxMinutes')),
  };
}
const invalid = (d: ReturnType<typeof crewFields>) =>
  !d.name || Number.isNaN(d.homeLat) || Number.isNaN(d.homeLng) ||
  !Number.isInteger(d.maxStops) || d.maxStops <= 0 || !Number.isInteger(d.maxMinutes) || d.maxMinutes <= 0;

export async function createCrew(form: FormData) {
  await requireDispatcher();
  const data = crewFields(form);
  if (invalid(data)) back('/dispatch/crews/new', 'Name, home coordinates, and positive stop/minute limits are required');
  try {
    const crew = await prisma.crew.create({ data });
    back('/dispatch/crews', `${crew.name} created`);
  } catch (e) {
    if (isDup(e)) back('/dispatch/crews/new', 'That name is already in use');
    throw e;
  }
}

export async function updateCrew(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  const data = crewFields(form);
  if (invalid(data)) back(`/dispatch/crews/${id}`, 'Name, home coordinates, and positive stop/minute limits are required');
  try {
    await prisma.crew.update({ where: { id }, data });
    back(`/dispatch/crews/${id}`, 'Saved');
  } catch (e) {
    if (isDup(e)) back(`/dispatch/crews/${id}`, 'That name is already in use');
    throw e;
  }
}

export async function deleteCrew(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  const [agreements, visits, users] = await Promise.all([
    prisma.agreement.count({ where: { crewId: id } }),
    prisma.visit.count({ where: { crewId: id } }),
    prisma.user.count({ where: { crewId: id } }),
  ]);
  if (agreements > 0 || visits > 0) back(`/dispatch/crews/${id}`, 'Still has agreements or visits');
  if (users > 0) back(`/dispatch/crews/${id}`, 'Still has staff accounts assigned');
  await prisma.crew.delete({ where: { id } });
  back('/dispatch/crews', 'Crew deleted');
}
