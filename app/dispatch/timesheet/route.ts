import { systemClock } from '@/src/clock';
import { timesheetRows } from '@/src/crews/timesheet';
import { currentRole } from '@/src/session';
import { localDateOf, mondayOf } from '@/src/time';

const csvField = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Timesheet export (P2 #6): one row per completed visit, worked hours from startedAt/finishedAt. */
export async function GET(req: Request) {
  if ((await currentRole())?.kind !== 'dispatcher') return new Response('Not yours', { status: 403 });
  const week = new URL(req.url).searchParams.get('week');
  const monday = mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : localDateOf(systemClock.now()));
  const rows = await timesheetRows(monday);

  const lines = rows.map((r) =>
    [r.crew, r.date, r.address, r.startedAt.toISOString(), r.finishedAt.toISOString(), r.hours.toFixed(2)]
      .map(csvField).join(','));
  const csv = ['Crew,Date,Address,Started,Finished,Hours', ...lines].join('\n');

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="timesheet-${monday}.csv"`,
    },
  });
}
