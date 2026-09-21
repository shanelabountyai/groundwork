'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/src/db';
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

/** BO-1: a prospect can be entered before they sign — no agreement required in the same step. */
export async function createProperty(form: FormData) {
  await requireDispatcher();
  const data = propertyFields(form);
  if (!data.address || !data.customerName || !data.customerPhone || Number.isNaN(data.lat) || Number.isNaN(data.lng)) {
    back('/dispatch/properties/new', 'Address, customer name, phone, and coordinates are required');
  }
  const property = await prisma.property.create({ data });
  back(`/dispatch/properties/${property.id}`, 'Property created — add an agreement when they sign');
}

/** Property fields aren't snapshotted onto visits, so an edit takes effect immediately with no regeneration. */
export async function updateProperty(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  const data = propertyFields(form);
  if (!data.address || !data.customerName || !data.customerPhone || Number.isNaN(data.lat) || Number.isNaN(data.lng)) {
    back(`/dispatch/properties/${id}`, 'Address, customer name, phone, and coordinates are required');
  }
  await prisma.property.update({ where: { id }, data });
  back(`/dispatch/properties/${id}`, 'Saved');
}

export async function deleteProperty(form: FormData) {
  await requireDispatcher();
  const id = text(form, 'id');
  const agreements = await prisma.agreement.count({ where: { propertyId: id } });
  if (agreements > 0) back(`/dispatch/properties/${id}`, 'Remove its agreements first');
  await prisma.property.delete({ where: { id } });
  back('/dispatch/properties', 'Property deleted');
}
