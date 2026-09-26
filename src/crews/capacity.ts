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
    select: { serviceType: { select: { estimatedMinutes: true } } },
  });
  return { stops: visits.length, minutes: visits.reduce((m, v) => m + v.serviceType.estimatedMinutes, 0) };
}

export interface Overload extends Load {
  crewId: string;
  date: LocalDate;
}

/**
 * Which of these crew-days are over capacity. Generation and agreement edits
 * report this instead of refusing: a pattern's visits must exist, so the answer
 * is a warning, not a rollback.
 */
// ponytail: one query per distinct crew-day; batch if a horizon run ever touches thousands.
export async function overloadedDays(tx: Tx, days: { crewId: string; date: LocalDate }[]): Promise<Overload[]> {
  const distinct = [...new Map(days.map((d) => [`${d.crewId}|${d.date}`, d])).values()];
  const crews = new Map((await tx.crew.findMany({ where: { id: { in: distinct.map((d) => d.crewId) } }, select: { id: true, maxStops: true, maxMinutes: true } })).map((c) => [c.id, c]));
  const out: Overload[] = [];
  for (const d of distinct.sort((a, b) => a.date.localeCompare(b.date) || a.crewId.localeCompare(b.crewId))) {
    const load = await dayLoad(tx, d.crewId, d.date);
    const crew = crews.get(d.crewId);
    if (crew && overCapacity(load, crew)) out.push({ ...d, ...load });
  }
  return out;
}
