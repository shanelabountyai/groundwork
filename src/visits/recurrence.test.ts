import { describe, expect, it } from 'vitest';
import { isOccurrence, occurrenceDates, planVisits, type ExistingVisit, type Pattern } from './recurrence';

const window = (from: string, to: string) => ({ from, to });
const visit = (date: string, over: Partial<ExistingVisit> = {}): ExistingVisit => ({
  id: `v-${date}`, occurrenceDate: date, date, detached: false, status: 'pending', ...over,
});

describe('occurrenceDates', () => {
  it('biweekly from Mon Mar 2 lands on Mar 2, 16, 30 — across the month boundary', () => {
    const p: Pattern = { frequency: 'biweekly', startDate: '2026-03-02' };
    expect(occurrenceDates(p, window('2026-03-02', '2026-04-15'))).toEqual(['2026-03-02', '2026-03-16', '2026-03-30', '2026-04-13']);
  });

  it('counts parity from the start date, not the window', () => {
    const p: Pattern = { frequency: 'biweekly', startDate: '2026-03-02' };
    expect(occurrenceDates(p, window('2026-03-10', '2026-03-31'))).toEqual(['2026-03-16', '2026-03-30']);
  });

  it('weekly, every-4-weeks, and one-time', () => {
    expect(occurrenceDates({ frequency: 'weekly', startDate: '2026-03-02' }, window('2026-03-01', '2026-03-20')))
      .toEqual(['2026-03-02', '2026-03-09', '2026-03-16']);
    expect(occurrenceDates({ frequency: 'every_4_weeks', startDate: '2026-01-05' }, window('2026-01-01', '2026-03-31')))
      .toEqual(['2026-01-05', '2026-02-02', '2026-03-02', '2026-03-30']);
    expect(occurrenceDates({ frequency: 'one_time', startDate: '2026-03-04' }, window('2026-03-01', '2026-12-31')))
      .toEqual(['2026-03-04']);
  });

  it('never produces a date before the start', () => {
    expect(occurrenceDates({ frequency: 'weekly', startDate: '2026-03-02' }, window('2026-02-01', '2026-03-02')))
      .toEqual(['2026-03-02']);
    expect(isOccurrence({ frequency: 'weekly', startDate: '2026-03-02' }, '2026-02-23')).toBe(false);
  });

  it('crosses a DST change without drifting a day', () => {
    // US DST began 2026-03-08.
    expect(occurrenceDates({ frequency: 'weekly', startDate: '2026-03-06' }, window('2026-03-06', '2026-03-13')))
      .toEqual(['2026-03-06', '2026-03-13']);
  });
});

describe('planVisits', () => {
  const biweekly: Pattern = { frequency: 'biweekly', startDate: '2026-03-02' };
  const w = window('2026-03-02', '2026-03-30');

  it('creates every missing occurrence, then nothing on a second run', () => {
    const first = planVisits(biweekly, [], w);
    expect(first.create).toEqual(['2026-03-02', '2026-03-16', '2026-03-30']);
    const second = planVisits(biweekly, first.create.map((d) => visit(d)), w);
    expect(second).toEqual({ create: [], obsolete: [] });
  });

  it('does not resurrect the original date of a rescheduled visit', () => {
    const moved = visit('2026-03-16', { date: '2026-03-18', detached: true });
    const plan = planVisits(biweekly, [visit('2026-03-02'), moved, visit('2026-03-30')], w);
    expect(plan.create).toEqual([]);
    expect(plan.obsolete).toEqual([]);
  });

  it('a frequency edit withdraws only future, pending, attached visits', () => {
    const existing = [
      visit('2026-03-02', { status: 'completed' }),
      visit('2026-03-09'),                                        // future, pending: withdrawn
      visit('2026-03-16', { status: 'skipped' }),                 // history: kept
      visit('2026-03-23', { date: '2026-03-24', detached: true }), // moved by hand: kept
    ];
    const plan = planVisits({ frequency: 'every_4_weeks', startDate: '2026-03-02' }, existing, window('2026-03-05', '2026-04-02'));
    expect(plan.obsolete.map((v) => v.id)).toEqual(['v-2026-03-09']);
    expect(plan.create).toEqual(['2026-03-30']);
  });

  it('never touches anything before the boundary', () => {
    const plan = planVisits({ frequency: 'weekly', startDate: '2026-03-03' }, [visit('2026-03-02')], window('2026-03-05', '2026-03-12'));
    expect(plan.obsolete).toEqual([]);
  });

  it('paused: generates nothing and withdraws future pending visits', () => {
    const plan = planVisits(biweekly, [visit('2026-03-16'), visit('2026-03-30')], window('2026-03-10', '2026-04-07'), { active: false });
    expect(plan.create).toEqual([]);
    expect(plan.obsolete.map((v) => v.occurrenceDate)).toEqual(['2026-03-16', '2026-03-30']);
  });
});
