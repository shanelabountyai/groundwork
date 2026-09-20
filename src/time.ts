/**
 * Calendar dates in the business's timezone. Visits are day-granular — a crew
 * works Tuesday, not 14:00Z — so the unit everywhere is a 'YYYY-MM-DD' string,
 * and arithmetic on it is calendar arithmetic that no DST change can drift.
 */
const BUSINESS_TZ = 'America/Chicago';

export type LocalDate = string;

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** The local date an instant falls on. */
export const localDateOf = (instant: Date): LocalDate => dateFmt.format(instant);

const utcMidnight = (d: LocalDate) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day);
};

export const addDays = (d: LocalDate, days: number): LocalDate =>
  new Date(utcMidnight(d) + days * 86_400_000).toISOString().slice(0, 10);

/** Whole days from `a` to `b`. */
export const daysBetween = (a: LocalDate, b: LocalDate): number =>
  Math.round((utcMidnight(b) - utcMidnight(a)) / 86_400_000);

/** A LocalDate to and from a Postgres `date` column, which Prisma surfaces as UTC midnight. */
export const toDbDate = (d: LocalDate) => new Date(utcMidnight(d));
export const fromDbDate = (d: Date): LocalDate => d.toISOString().slice(0, 10);

const shortFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
/** 'Mon, Sep 21' — for people, never for storage. */
export const shortDay = (d: LocalDate) => shortFmt.format(toDbDate(d));

/** The Monday of the week `d` falls in. */
export const mondayOf = (d: LocalDate) => addDays(d, -((toDbDate(d).getUTCDay() + 6) % 7));
