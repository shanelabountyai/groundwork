import Link from 'next/link';
import { connection } from 'next/server';
import { systemClock } from '@/src/clock';
import { rangeReport, type Tally } from '@/src/crews/range';
import { usd } from '@/src/money';
import { requireDispatcher } from '@/src/session';
import { addDays, localDateOf, mondayOf, shortDay } from '@/src/time';

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);
const DEFAULT_WEEKS = 13;

function Rows({ rows }: { rows: (Tally & { key: string; label: string })[] }) {
  return rows.map((r) => (
    <tr key={r.key}>
      <th scope="row">{r.label}</th>
      <td className="pad num">{r.completed}</td>
      <td className="pad num">{r.skipped || '—'}</td>
      <td className="pad num">{r.open || '—'}</td>
      <td className="pad num">{pct(r.completionRate)}</td>
      <td className="pad num price">{usd(r.scheduledCents)}</td>
    </tr>
  ));
}

const Head = ({ first }: { first: string }) => (
  <thead>
    <tr>
      <th scope="col">{first}</th><th scope="col">Done</th><th scope="col">Skipped</th>
      <th scope="col">Open</th><th scope="col">Completion</th><th scope="col">Scheduled value</th>
    </tr>
  </thead>
);

/** BO-9: the weekly report over a run of weeks — trend, then crews, then customers. */
export default async function Range({ searchParams }: { searchParams: Promise<{ from?: string; weeks?: string }> }) {
  await connection();
  await requireDispatcher();
  const { from, weeks: w } = await searchParams;
  const weeks = Math.min(52, Math.max(1, Number.parseInt(w ?? '', 10) || DEFAULT_WEEKS));
  const start = /^\d{4}-\d{2}-\d{2}$/.test(from ?? '') ? mondayOf(from!) : addDays(mondayOf(localDateOf(systemClock.now())), -(weeks - 1) * 7);
  const r = await rangeReport(start, weeks);

  return (
    <main className="desk">
      <header className="bar">
        <div>
          <h1>Report · {weeks} weeks</h1>
          <p className="meta">{shortDay(start)} – {shortDay(addDays(start, weeks * 7 - 1))}</p>
        </div>
        <nav className="links">
          <Link className="btn" href={`/dispatch/report/range?from=${addDays(start, -weeks * 7)}&weeks=${weeks}`}>← Earlier</Link>
          <Link className="btn" href={`/dispatch/report?week=${start}`}>Weekly</Link>
          <Link className="btn" href={`/dispatch/report/range?from=${addDays(start, weeks * 7)}&weeks=${weeks}`}>Later →</Link>
          {[4, 13, 26, 52].map((n) => <Link key={n} className="btn" href={`/dispatch/report/range?from=${start}&weeks=${n}`}>{n} wk</Link>)}
        </nav>
      </header>
      <section className="card" aria-label="Completed visits per week">
        <div className="bar"><h2>Completed visits per week</h2></div>
        <div className="bars">
          {(() => {
            const top = Math.max(1, ...r.weeks.map((x) => x.completed));
            return r.weeks.map((x) => (
              <div key={x.monday} className="barcol">
                <b>{x.completed}</b>
                <div className="col" style={{ height: Math.round((x.completed / top) * 120) }} />
                <span className="hint">{shortDay(x.monday)}</span>
              </div>
            ));
          })()}
        </div>
      </section>
      <div className="scroll">
        <table className="board report">
          <Head first="Week of" />
          <tbody>
            <Rows rows={r.weeks.map((x) => ({ ...x, key: x.monday, label: shortDay(x.monday) }))} />
            <tr className="totals"><th scope="row">Total</th>
              <td className="pad num">{r.total.completed}</td><td className="pad num">{r.total.skipped || '—'}</td>
              <td className="pad num">{r.total.open || '—'}</td><td className="pad num">{pct(r.total.completionRate)}</td>
              <td className="pad num price">{usd(r.total.scheduledCents)}</td></tr>
          </tbody>
        </table>
      </div>
      <h2>By crew</h2>
      <div className="scroll">
        <table className="board report"><Head first="Crew" /><tbody><Rows rows={r.crews.map((c) => ({ ...c, key: c.name, label: c.name }))} /></tbody></table>
      </div>
      <h2>By customer</h2>
      <div className="scroll">
        <table className="board report">
          <Head first="Customer" />
          <tbody><Rows rows={r.customers.map((c, i) => ({ ...c, key: `${i}`, label: `${c.name} · ${c.address}` }))} /></tbody>
        </table>
      </div>
      <p className="meta">
        Same definitions as the weekly report: completion is out of visits that reached an outcome, and scheduled value is completed visits at their snapshotted price — not money in hand.
        A visit records its crew, not the person, so “by crew” is the finest split there is. Miles stay on the weekly page.
      </p>
    </main>
  );
}
