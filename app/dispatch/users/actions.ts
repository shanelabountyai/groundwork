'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/src/db';
import { Prisma, type UserRole } from '@/src/generated/prisma/client';
import { normalizeLogin, requireDispatcher } from '@/src/session';

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
function userError(f: ReturnType<typeof userFields>): string | null {
  if (!f.name) return 'Name is required';
  if (!isRole(f.role)) return 'Role is required';
  if (f.role === 'crew' && !f.crewId) return 'A crew role needs a crew';
  if (!f.email.ok || !f.phone.ok) return 'Check the email and phone format';
  if (!f.email.value && !f.phone.value) return 'An email or phone is required';
  return null;
}

export async function createUser(form: FormData) {
  await requireDispatcher();
  const f = userFields(form);
  const error = userError(f);
  if (error) back('/dispatch/users/new', error);
  try {
    const user = await prisma.user.create({
      data: { name: f.name, role: f.role as UserRole, crewId: f.role === 'crew' ? f.crewId : null, email: f.email.value, phone: f.phone.value },
    });
    back('/dispatch/users', `${user.name} created — they can sign in with a magic link`);
  } catch (e) {
    if (isDup(e)) back('/dispatch/users/new', 'That email or phone is already in use');
    throw e;
  }
}

export async function updateUser(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  const f = userFields(form);
  const error = userError(f);
  if (error) back(`/dispatch/users/${id}`, error);
  try {
    await prisma.user.update({
      where: { id },
      data: { name: f.name, role: f.role as UserRole, crewId: f.role === 'crew' ? f.crewId : null, email: f.email.value, phone: f.phone.value },
    });
    back(`/dispatch/users/${id}`, 'Saved');
  } catch (e) {
    if (isDup(e)) back(`/dispatch/users/${id}`, 'That email or phone is already in use');
    throw e;
  }
}

/** Sessions and login tokens cascade-delete with the user (prisma/schema.prisma onDelete: Cascade) — deleting is what revokes access. */
export async function deleteUser(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  await prisma.user.delete({ where: { id } });
  back('/dispatch/users', 'User deleted');
}
