import { systemClock } from '@/src/clock';
import { personDayRows, timesheetRows } from '@/src/crews/timesheet';
import { currentRole } from '@/src/session';
import { localDateOf, mondayOf } from '@/src/time';

const csvField = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * Timesheet export. First block (BO-8): hours per person per day from their
 * own clock in/out. Second block (P2 #6): each completed visit's on-site time,
 * kept as the per-stop record — it is not what anyone is paid on.
 */
export async function GET(req: Request) {
  if ((await currentRole())?.kind !== 'dispatcher') return new Response('Not yours', { status: 403 });
  const week = new URL(req.url).searchParams.get('week');
  const monday = mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : localDateOf(systemClock.now()));
  const [people, visits] = await Promise.all([personDayRows(monday), timesheetRows(monday)]);

  const row = (fields: string[]) => fields.map(csvField).join(',');
  const csv = [
    'Person,Crew,Date,Hours,Still clocked in',
    ...people.map((r) => row([r.name, r.crew, r.date, r.hours.toFixed(2), r.open ? 'yes' : ''])),
    '',
    'Crew,Date,Address,Started,Finished,Hours on site',
    ...visits.map((r) => row([r.crew, r.date, r.address, r.startedAt.toISOString(), r.finishedAt.toISOString(), r.hours.toFixed(2)])),
  ].join('\n');

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="timesheet-${monday}.csv"`,
    },
  });
}
