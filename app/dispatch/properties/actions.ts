'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/src/db';
import { revokePortalAccess } from '@/src/portal/session';
import { backWithErrors } from '@/src/forms';
import { requireDispatcher } from '@/src/session';

const text = (form: FormData, k: string) => { const v = form.get(k); return typeof v === 'string' ? v.trim() : ''; };

function back(path: string, msg?: string): never {
  revalidatePath(path);
  redirect(msg ? `${path}?msg=${encodeURIComponent(msg)}` : path);
}

function propertyFields(form: FormData) {
  const lat = Number(text(form, 'lat'));
  const lng = Number(text(form, 'lng'));
  return {
    address: text(form, 'address'),
    lat, lng,
    accessNotes: text(form, 'accessNotes'),
    customerName: text(form, 'customerName'),
    customerPhone: text(form, 'customerPhone'),
    customerEmail: text(form, 'customerEmail') || null,
    notifyOnEnRoute: form.get('notifyOnEnRoute') === 'on',
  };
}

function fieldErrors(d: ReturnType<typeof propertyFields>) {
  const e: Record<string, string> = {};
  if (!d.customerName) e.customerName = 'Customer name is required';
  if (!d.customerPhone) e.customerPhone = 'Phone is required';
  if (!d.address) e.address = 'Address is required';
  if (Number.isNaN(d.lat)) e.lat = 'Enter a latitude';
  if (Number.isNaN(d.lng)) e.lng = 'Enter a longitude';
  return e;
}

/** BO-1: a prospect can be entered before they sign — no agreement required in the same step. */
export async function createProperty(form: FormData) {
  await requireDispatcher();
  const data = propertyFields(form);
  const errors = fieldErrors(data);
  if (Object.keys(errors).length) backWithErrors('/dispatch/properties/new', form, errors);
  const property = await prisma.property.create({ data });
  back(`/dispatch/properties/${property.id}`, 'Property created — add an agreement when they sign');
}

/** Property fields aren't snapshotted onto visits, so an edit takes effect immediately with no regeneration. */
export async function updateProperty(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  const data = propertyFields(form);
  const errors = fieldErrors(data);
  if (Object.keys(errors).length) backWithErrors(`/dispatch/properties/${id}`, form, errors);
  const before = await prisma.property.findUnique({ where: { id }, select: { customerEmail: true, customerPhone: true } });
  await prisma.property.update({ where: { id }, data });
  // A changed contact means a different person may own the house; the old one must not keep portal access.
  if (before && (before.customerEmail !== data.customerEmail || before.customerPhone !== data.customerPhone)) await revokePortalAccess(id);
  back(`/dispatch/properties/${id}`, 'Saved');
}

export async function deleteProperty(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  const [agreements, jobs] = await Promise.all([prisma.agreement.count({ where: { propertyId: id } }), prisma.job.count({ where: { propertyId: id } })]);
  if (agreements + jobs > 0) back(`/dispatch/properties/${id}`, 'Has agreements or one-off jobs — its history stays');
  await prisma.property.delete({ where: { id } });
  back('/dispatch/properties', 'Property deleted');
}
