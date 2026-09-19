import { addDays, daysBetween, type LocalDate } from '../time';

/**
 * The recurrence engine's pure half. Adapted from clearpath's
 * scheduling/recurrence.ts: same occurrence-key idea, anchored on the start
 * date instead of a weekday, with this trade's four frequencies.
 *
 * Generated visits are the source of truth; an agreement is only the pattern
 * that proposes them. Idempotency comes from `occurrenceDate`, the slot the
 * pattern produced, which a reschedule never changes. Keying on `date` is the
 * classic bug: move a visit off Tuesday and the next run books Tuesday again.
 */

export type Frequency = 'weekly' | 'biweekly' | 'every_4_weeks' | 'one_time';

export interface Pattern {
  frequency: Frequency;
  startDate: LocalDate;
}

export interface Window {
  from: LocalDate;
  to: LocalDate;
}

const STEP_DAYS: Record<Exclude<Frequency, 'one_time'>, number> = {
  weekly: 7,
  biweekly: 14,
  every_4_weeks: 28,
};

export function isOccurrence(p: Pattern, date: LocalDate): boolean {
  const gap = daysBetween(p.startDate, date);
  if (gap < 0) return false;
  return p.frequency === 'one_time' ? gap === 0 : gap % STEP_DAYS[p.frequency] === 0;
}

/** Every occurrence inside the window, inclusive at both ends. */
export function occurrenceDates(p: Pattern, w: Window): LocalDate[] {
  if (p.frequency === 'one_time') return p.startDate >= w.from && p.startDate <= w.to ? [p.startDate] : [];
  const step = STEP_DAYS[p.frequency];
  // Parity counts from the start date, so the window never shifts which weeks a property gets.
  const gap = daysBetween(p.startDate, w.from);
  let cursor = addDays(p.startDate, gap <= 0 ? 0 : Math.ceil(gap / step) * step);
  const dates: LocalDate[] = [];
  for (; cursor <= w.to; cursor = addDays(cursor, step)) dates.push(cursor);
  return dates;
}

export interface ExistingVisit {
  id: string;
  occurrenceDate: LocalDate;
  date: LocalDate;
  detached: boolean;
  status: string;
}

export interface Plan {
  /** Occurrence dates with no visit yet. */
  create: LocalDate[];
  /** Future, pending, attached visits the pattern no longer produces. */
  obsolete: ExistingVisit[];
}

/**
 * What a horizon run, a frequency edit, or a pause should do.
 *
 * `w.from` is the line between history and future: nothing dated before it is
 * created or withdrawn. Completed and skipped visits are history wherever they
 * sit; a detached visit was placed by a person and is kept even when the
 * pattern changes under it.
 */
export function planVisits(p: Pattern, existing: ExistingVisit[], w: Window, opts: { active?: boolean } = {}): Plan {
  const active = opts.active ?? true;
  const taken = new Set(existing.map((v) => v.occurrenceDate));
  return {
    create: active ? occurrenceDates(p, w).filter((d) => !taken.has(d)) : [],
    obsolete: existing.filter(
      (v) => v.date >= w.from && !v.detached && v.status === 'pending' && !(active && isOccurrence(p, v.occurrenceDate)),
    ),
  };
}
