import { systemClock, type Clock } from '../clock';
import { prisma } from '../db';
import type { SkipReason, VisitStatus } from '../generated/prisma/client';
import { fromDbDate, localDateOf } from '../time';

/**
 * The only path that changes a visit's status. pending → en_route → completed,
 * and a skip from either open state (the customer can cancel before the crew
 * leaves). Completed and skipped are final: undoing one is a dispatcher's
 * correction, not a crew tap.
 */
const NEXT: Record<VisitStatus, readonly VisitStatus[]> = {
  pending: ['en_route', 'skipped'],
  en_route: ['completed', 'skipped'],
  completed: [],
  skipped: [],
};

/** The fixed list a crew picks from, in the order the phone shows it. */
export const SKIP_REASONS: Record<SkipReason, string> = {
  locked_gate: 'Locked gate',
  dog_loose: 'Dog loose',
  customer_request: 'Customer asked to skip',
  weather: 'Weather',
  other: 'Other',
};

export const isSkipReason = (s: unknown): s is SkipReason => typeof s === 'string' && Object.hasOwn(SKIP_REASONS, s);

export const canTransition = (from: VisitStatus, to: VisitStatus) => NEXT[from].includes(to);

export type StatusEvent =
  | { to: 'en_route' }
  | { to: 'completed'; note?: string; beforePhoto?: string; afterPhoto?: string }
  | { to: 'skipped'; reason: SkipReason; note?: string };

/** Refused on purpose: a stale screen, a double tap, someone else's stop. */
export class IllegalTransition extends Error {}

const clean = (s?: string) => s?.trim() || null;

export async function transition(visitId: string, crewId: string, event: StatusEvent, clock: Clock = systemClock) {
  const now = clock.now();
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: { agreement: { include: { property: true, serviceType: true } } },
  });
  // One message for "not yours" and "not found", so ids cannot be probed.
  if (!visit || visit.crewId !== crewId) throw new IllegalTransition('No such stop on this crew');
  if (fromDbDate(visit.date) !== localDateOf(now)) throw new IllegalTransition("Only today's stops can be updated");
  if (!canTransition(visit.status, event.to)) throw new IllegalTransition(`A ${visit.status} stop cannot become ${event.to}`);

  const data =
    event.to === 'en_route' ? { status: event.to, startedAt: now }
    : event.to === 'completed' ? { status: event.to, finishedAt: now, note: clean(event.note), beforePhoto: event.beforePhoto ?? null, afterPhoto: event.afterPhoto ?? null }
    : { status: event.to, finishedAt: now, skipReason: event.reason, note: clean(event.note) };
  if (event.to === 'skipped' && event.reason === 'other' && !data.note) throw new IllegalTransition('Say why in the note when the reason is "other"');

  await prisma.$transaction(async (tx) => {
    // Conditional on the status just read: of two racing taps, the second matches nothing.
    const { count } = await tx.visit.updateMany({ where: { id: visitId, status: visit.status }, data });
    if (count === 0) throw new IllegalTransition('This stop changed on another screen; reload');

    if (event.to === 'en_route' && visit.agreement.property.notifyOnEnRoute) {
      const p = visit.agreement.property;
      await tx.notification.create({
        data: {
          visitId,
          channel: p.customerEmail ? 'email' : 'sms',
          to: p.customerEmail ?? p.customerPhone,
          body: `Evergreen Property Care: your crew is on the way for ${visit.agreement.serviceType.name} at ${p.address}.`,
        },
      });
    }
  });
  return prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
}

/**
 * A customer cancels an upcoming stop from the portal — pending only ("the
 * customer can cancel before the crew leaves", see the NEXT table's comment
 * above). Property-scoped instead of crew-scoped, and not limited to today:
 * the portal shows any pending stop still ahead of it. Still goes through the
 * same `canTransition` table as `transition`, so "what can become skipped"
 * has one answer.
 */
export async function customerSkip(visitId: string, propertyId: string, clock: Clock = systemClock) {
  const now = clock.now();
  const visit = await prisma.visit.findUnique({ where: { id: visitId }, include: { agreement: true } });
  // One message for "not yours" and "not found", same reason as `transition`.
  if (!visit || visit.agreement.propertyId !== propertyId) throw new IllegalTransition('No such stop for this property');
  if (visit.status !== 'pending' || !canTransition(visit.status, 'skipped')) {
    throw new IllegalTransition(`A ${visit.status} stop cannot be cancelled`);
  }
  const { count } = await prisma.visit.updateMany({
    where: { id: visitId, status: 'pending' },
    data: { status: 'skipped', finishedAt: now, skipReason: 'customer_request' },
  });
  if (count === 0) throw new IllegalTransition('This stop changed; reload');
  return prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
}
