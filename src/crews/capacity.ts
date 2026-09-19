import type { Tx } from '../db';
import { toDbDate, type LocalDate } from '../time';

export interface Load {
  stops: number;
  minutes: number;
}

export interface Capacity {
  maxStops: number;
  maxMinutes: number;
}

export const overCapacity = (load: Load, cap: Capacity) => load.stops > cap.maxStops || load.minutes > cap.maxMinutes;

/** A dispatcher's reason for pushing a day past capacity. Logged, never silent. */
export interface Override {
  reason: string;
  by: string;
}

export class CapacityExceeded extends Error {
  constructor(readonly load: Load, readonly capacity: Capacity) {
    super(`Over capacity: ${load.stops}/${capacity.maxStops} stops, ${load.minutes}/${capacity.maxMinutes} min`);
  }
}

/** What a crew-day carries. Skipped visits no longer take a slot. */
export async function dayLoad(tx: Tx, crewId: string, date: LocalDate): Promise<Load> {
  const visits = await tx.visit.findMany({
    where: { crewId, date: toDbDate(date), status: { not: 'skipped' } },
    select: { agreement: { select: { serviceType: { select: { estimatedMinutes: true } } } } },
  });
  return { stops: visits.length, minutes: visits.reduce((m, v) => m + v.agreement.serviceType.estimatedMinutes, 0) };
}
