'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/src/db';
import { Prisma, type UserRole } from '@/src/generated/prisma/client';
import { backWithErrors } from '@/src/forms';
import { normalizeLogin, requireDispatcher } from '@/src/session';
import { LastDispatcher, withoutDispatcher } from '@/src/users';

const text = (form: FormData, k: string) => { const v = form.get(k); return typeof v === 'string' ? v.trim() : ''; };
const isDup = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const ROLES = new Set<UserRole>(['dispatcher', 'crew']);
const isRole = (v: string): v is UserRole => ROLES.has(v as UserRole);

function back(path: string, msg?: string): never {
  revalidatePath(path);
  redirect(msg ? `${path}?msg=${encodeURIComponent(msg)}` : path);
}

/** Reuses the login form's own normalizer (src/session.ts) so a stored contact always matches what sign-in looks up. */
function contact(input: string, kind: 'email' | 'phone'): { value: string | null; ok: boolean } {
  if (!input) return { value: null, ok: true };
  const r = normalizeLogin(input);
  return r && kind in r ? { value: (r as Record<string, string>)[kind]!, ok: true } : { value: null, ok: false };
}

function userFields(form: FormData) {
  return {
    name: text(form, 'name'),
    role: text(form, 'role'),
    crewId: text(form, 'crewId'),
    email: contact(text(form, 'email'), 'email'),
    phone: contact(text(form, 'phone'), 'phone'),
  };
}

/** role/crewId agree, and at least one contact is given — the same shape the DB's own check constraints enforce (prisma/schema.prisma). */
function userErrors(f: ReturnType<typeof userFields>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.name) e.name = 'Name is required';
  if (!isRole(f.role)) e.role = 'Role is required';
  else if (f.role === 'crew' && !f.crewId) e.crewId = 'A crew role needs a crew';
  if (!f.email.ok) e.email = 'Check the email format';
  if (!f.phone.ok) e.phone = 'Check the phone format';
  if (f.email.ok && f.phone.ok && !f.email.value && !f.phone.value) e.email = 'An email or phone is required';
  return e;
}

export async function createUser(form: FormData) {
  await requireDispatcher();
  const f = userFields(form);
  const errors = userErrors(f);
  if (Object.keys(errors).length) backWithErrors('/dispatch/users/new', form, errors);
  try {
    const user = await prisma.user.create({
      data: { name: f.name, role: f.role as UserRole, crewId: f.role === 'crew' ? f.crewId : null, email: f.email.value, phone: f.phone.value },
    });
    back('/dispatch/users', `${user.name} created — they can sign in with a magic link`);
  } catch (e) {
    if (isDup(e)) backWithErrors('/dispatch/users/new', form, { email: 'That email or phone is already in use' });
    throw e;
  }
}

export async function updateUser(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  const f = userFields(form);
  const errors = userErrors(f);
  if (Object.keys(errors).length) backWithErrors(`/dispatch/users/${id}`, form, errors);
  try {
    const data = { name: f.name, role: f.role as UserRole, crewId: f.role === 'crew' ? f.crewId : null, email: f.email.value, phone: f.phone.value };
    // Only a demotion can orphan the desk; anything else skips the lock.
    if (f.role === 'dispatcher') await prisma.user.update({ where: { id }, data });
    else await withoutDispatcher(id, (tx) => tx.user.update({ where: { id }, data }));
    back(`/dispatch/users/${id}`, 'Saved');
  } catch (e) {
    if (e instanceof LastDispatcher) backWithErrors(`/dispatch/users/${id}`, form, { role: e.message });
    if (isDup(e)) backWithErrors(`/dispatch/users/${id}`, form, { email: 'That email or phone is already in use' });
    throw e;
  }
}

/** Sessions and login tokens cascade-delete with the user (prisma/schema.prisma onDelete: Cascade) — deleting is what revokes access. */
export async function deleteUser(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  try {
    await withoutDispatcher(id, (tx) => tx.user.delete({ where: { id } }));
  } catch (e) {
    if (e instanceof LastDispatcher) back(`/dispatch/users/${id}`, e.message);
    throw e;
  }
  back('/dispatch/users', 'User deleted');
}
