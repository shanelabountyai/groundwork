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

function crewFields(form: FormData) {
  return {
    name: text(form, 'name'),
    homeLat: Number(text(form, 'homeLat')),
    homeLng: Number(text(form, 'homeLng')),
    maxStops: Number(text(form, 'maxStops')),
    maxMinutes: Number(text(form, 'maxMinutes')),
  };
}
function fieldErrors(d: ReturnType<typeof crewFields>) {
  const e: Record<string, string> = {};
  if (!d.name) e.name = 'Name is required';
  if (Number.isNaN(d.homeLat)) e.homeLat = 'Enter a latitude';
  if (Number.isNaN(d.homeLng)) e.homeLng = 'Enter a longitude';
  if (!Number.isInteger(d.maxStops) || d.maxStops <= 0) e.maxStops = 'Enter a positive whole number';
  if (!Number.isInteger(d.maxMinutes) || d.maxMinutes <= 0) e.maxMinutes = 'Enter a positive whole number';
  return e;
}

export async function createCrew(form: FormData) {
  await requireDispatcher();
  const data = crewFields(form);
  const errors = fieldErrors(data);
  if (Object.keys(errors).length) backWithErrors('/dispatch/crews/new', form, errors);
  try {
    const crew = await prisma.crew.create({ data });
    back('/dispatch/crews', `${crew.name} created`);
  } catch (e) {
    if (isDup(e)) backWithErrors('/dispatch/crews/new', form, { name: 'That name is already in use' });
    throw e;
  }
}

export async function updateCrew(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  const data = crewFields(form);
  const errors = fieldErrors(data);
  if (Object.keys(errors).length) backWithErrors(`/dispatch/crews/${id}`, form, errors);
  try {
    await prisma.crew.update({ where: { id }, data });
    back(`/dispatch/crews/${id}`, 'Saved');
  } catch (e) {
    if (isDup(e)) backWithErrors(`/dispatch/crews/${id}`, form, { name: 'That name is already in use' });
    throw e;
  }
}

export async function deleteCrew(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  const [agreements, visits, users, hours] = await Promise.all([
    prisma.agreement.count({ where: { crewId: id } }),
    prisma.visit.count({ where: { crewId: id } }),
    prisma.user.count({ where: { crewId: id } }),
    prisma.timeEntry.count({ where: { crewId: id } }),
  ]);
  if (agreements > 0 || visits > 0) back(`/dispatch/crews/${id}`, 'Still has agreements or visits');
  if (hours > 0) back(`/dispatch/crews/${id}`, 'Has timesheet hours on record');
  if (users > 0) back(`/dispatch/crews/${id}`, 'Still has staff accounts assigned');
  await prisma.crew.delete({ where: { id } });
  back('/dispatch/crews', 'Crew deleted');
}
