import { systemClock } from '@/src/clock';
import { ownerReport } from '@/src/crews/report';
import { currentRole } from '@/src/session';
import { localDateOf, mondayOf } from '@/src/time';

const csvField = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const dollars = (cents: number) => (cents / 100).toFixed(2);
const pct = (r: number | null) => (r === null ? '' : (r * 100).toFixed(1));

/** The owner's week as CSV: the report page's table, one row per crew plus the totals row. */
export async function GET(req: Request) {
  if ((await currentRole())?.kind !== 'dispatcher') return new Response('Not yours', { status: 403 });
  const week = new URL(req.url).searchParams.get('week');
  const monday = mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : localDateOf(systemClock.now()));
  const { crews, totals } = await ownerReport(monday);

  const row = (fields: string[]) => fields.map(csvField).join(',');
  const csv = [
    'Crew,Done,Skipped,Open,Completion %,Scheduled value,Miles,Drive minutes',
    ...crews.map((c) => row([c.name, `${c.completed}`, `${c.skipped}`, `${c.open}`, pct(c.completionRate), dollars(c.scheduledCents), `${c.miles}`, `${c.driveMinutes}`])),
    row(['All crews', `${totals.completed}`, `${totals.skipped}`, `${totals.open}`, pct(totals.completionRate), dollars(totals.scheduledCents), `${totals.miles}`, `${totals.driveMinutes}`]),
    '',
    'Invoiced,Collected',
    row([dollars(totals.invoicedCents), dollars(totals.collectedCents)]),
  ].join('\n');

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="report-${monday}.csv"`,
    },
  });
}
