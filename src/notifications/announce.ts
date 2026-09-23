import { prisma } from '../db';
import { toDbDate, type LocalDate } from '../time';

export class MessageRefused extends Error {}

const MAX_LENGTH = 320;

/** The channel and address a customer is reached on — email if they have one, as everywhere else. */
const reach = (p: { customerEmail: string | null; customerPhone: string }) =>
  ({ channel: p.customerEmail ? 'email' : 'sms', to: p.customerEmail ?? p.customerPhone }) as const;

function clean(body: string) {
  const text = body.trim();
  if (!text) throw new MessageRefused('Write a message first');
  if (text.length > MAX_LENGTH) throw new MessageRefused(`Keep it under ${MAX_LENGTH} characters (this is ${text.length})`);
  return `Evergreen Property Care: ${text}`;
}

/** BO-7: an ad-hoc message to one customer, through the same outbox a status change uses. Returns how many were queued. */
export async function messageProperty(propertyId: string, body: string) {
  const text = clean(body);
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) throw new MessageRefused('That customer no longer exists');
  await prisma.notification.create({ data: { ...reach(property), body: text } });
  return 1;
}

/**
 * BO-7: the same message to every customer still on a crew's route that day.
 * Skipped stops are off the route and completed ones are done, so neither is
 * told "running late". One message per property, however many stops it has.
 */
export async function messageCrewDay(crewId: string, date: LocalDate, body: string) {
  const text = clean(body);
  const visits = await prisma.visit.findMany({
    where: { crewId, date: toDbDate(date), status: { in: ['pending', 'en_route'] } },
    select: { property: true },
  });
  const properties = [...new Map(visits.map((v) => [v.property.id, v.property])).values()];
  if (properties.length === 0) throw new MessageRefused('Nobody left on this route to message');
  await prisma.notification.createMany({ data: properties.map((p) => ({ ...reach(p), body: text })) });
  return properties.length;
}
