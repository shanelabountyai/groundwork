import Link from 'next/link';
import { connection } from 'next/server';
import { systemClock } from '@/src/clock';
import { ownerReport } from '@/src/crews/report';
import { usd } from '@/src/money';
import { requireDispatcher } from '@/src/session';
import { addDays, localDateOf, mondayOf, shortDay } from '@/src/time';
import { SKIP_REASONS } from '@/src/visits/status';

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);

/** The owner's week (P1-2): work done, money earned, miles driven, per crew. */
export default async function Report({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await connection();
  await requireDispatcher();
  const { week } = await searchParams;
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(week ?? '') ? week! : localDateOf(systemClock.now()));
  const { crews, totals } = await ownerReport(monday);

  return (
    <main className="desk">
      <header className="bar">
        <div>
          <h1>Report · week of {shortDay(monday)}</h1>
          <p className="meta">{shortDay(monday)} – {shortDay(addDays(monday, 6))}</p>
        </div>
        <nav className="links">
          <Link className="btn" href={`/dispatch/report?week=${addDays(monday, -7)}`}>← Prev</Link>
          <Link className="btn" href={`/dispatch?week=${monday}`}>Board</Link>
          <Link className="btn" href={`/dispatch/report?week=${addDays(monday, 7)}`}>Next →</Link>
        </nav>
      </header>
      <div className="scroll">
        <table className="board report">
          <thead>
            <tr>
              <th scope="col">Crew</th>
              <th scope="col">Done</th>
              <th scope="col">Skipped</th>
              <th scope="col">Open</th>
              <th scope="col">Completion</th>
              <th scope="col">Revenue</th>
              <th scope="col">Miles</th>
              <th scope="col">Why skipped</th>
            </tr>
          </thead>
          <tbody>
            {crews.map((c) => (
              <tr key={c.id}>
                <th scope="row">{c.name}</th>
                <td className="pad num">{c.completed}</td>
                <td className="pad num">{c.skipped || '—'}</td>
                <td className="pad num">{c.open || '—'}</td>
                <td className="pad num">{pct(c.completionRate)}</td>
                <td className="pad num price">{usd(c.revenueCents)}</td>
                <td className="pad num">{c.miles} mi<span className="meta"> ~{Math.round(c.driveMinutes / 60)} h</span></td>
                <td className="pad">
                  {c.skips.length === 0 ? <span className="meta">—</span>
                    : c.skips.map((s) => `${SKIP_REASONS[s.reason]} ${s.count}`).join(' · ')}
                </td>
              </tr>
            ))}
            <tr className="totals">
              <th scope="row">All crews</th>
              <td className="pad num">{totals.completed}</td>
              <td className="pad num">{totals.skipped || '—'}</td>
              <td className="pad num">{totals.open || '—'}</td>
              <td className="pad num">{pct(totals.completionRate)}</td>
              <td className="pad num price">{usd(totals.revenueCents)}</td>
              <td className="pad num">{totals.miles} mi</td>
              <td className="pad" />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="meta">
        Completion is out of visits that reached an outcome{totals.open > 0 && ` — the ${totals.open} still open are not counted against it`}.
        Revenue is completed visits at the price each one snapshotted when it was scheduled.
        Miles include skipped stops (the crew still drove the route) and are the same straight-line estimate the route page shows, not drive time.
      </p>
    </main>
  );
}
