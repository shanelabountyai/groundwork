import type { Clock } from '../clock';
import { CapacityExceeded, dayLoad, overCapacity, type Capacity, type Override } from '../crews/capacity';
import { prisma, type Tx } from '../db';
import type { Prisma } from '../generated/prisma/client';
import { addDays, fromDbDate, shortDay, toDbDate, type LocalDate } from '../time';
import { today } from './generate';

/**
 * The rain day (P0-6). A dispatcher pushes one crew-day's pending visits
 * forward, previews what that does to the days they land on, then commits it
 * in one transaction. Preview and commit run the same planner over the same
 * reads, so what was shown is what gets checked.
 *
 * Preview states:
 * - empty:     no pending visit on the day. En-route, completed and skipped
 *              visits never move; the crew skips a started stop from the phone.
 * - clean:     every visit lands with no collision and every day in capacity.
 * - collision: a pushed visit lands where the same property already has one.
 *              Both show; per visit the dispatcher keeps both or pushes the
 *              pushed one further (to the next service day after the target).
 * - overflow:  a day that receives visits ends over capacity. Commit needs an
 *              override reason, logged once per visit that landed there.
 * - stale:     at commit the day no longer holds exactly the visits previewed.
 *              Nothing is applied; the preview is shown again.
 */

/** 'next_day', 'next_service_day', or a specific 'YYYY-MM-DD'. */
export const STALE_MSG = 'The day changed since the preview; check it again';

export type Target = string;
export type Resolution = 'keep' | 'further';

/** Invalid input or a preview that no longer matches the day. Nothing was applied. */
export class CascadeRefused extends Error {}

// ponytail: crews work Monday–Friday; per-crew working days if one ever works Saturdays.
export const isServiceDay = (d: LocalDate) => { const w = toDbDate(d).getUTCDay(); return w >= 1 && w <= 5; };

export function nextServiceDay(d: LocalDate): LocalDate {
  let n = addDays(d, 1);
  while (!isServiceDay(n)) n = addDays(n, 1);
  return n;
}

export function resolveTarget(from: LocalDate, target: Target): LocalDate {
  if (target === 'next_day') return addDays(from, 1);
  if (target === 'next_service_day') return nextServiceDay(from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(target) && fromDbDate(toDbDate(target)) === target) return target;
  throw new CascadeRefused(`Not a push target: ${target}`);
}

const stopInclude = { property: true, serviceType: true } as const;
export type Stop = Prisma.VisitGetPayload<{ include: typeof stopInclude }>;

const minutes = (vs: Stop[]) => vs.reduce((m, v) => m + v.serviceType.estimatedMinutes, 0);

/** Pure: what pushing `moving` to `to` does, given what already sits on the landing days. */
export function planCascade(p: {
  from: LocalDate;
  to: LocalDate;
  moving: Stop[];
  staying: Stop[];
  /** Non-skipped visits already on each possible landing day. */
  existing: Record<LocalDate, Stop[]>;
  capacity: Capacity;
  choices: Record<string, Resolution>;
}) {
  const further = nextServiceDay(p.to);
  const moves = p.moving.map((visit) => {
    const resolution: Resolution = p.choices[visit.id] === 'further' ? 'further' : 'keep';
    const date = resolution === 'further' ? further : p.to;
    const collisions = (p.existing[date] ?? []).filter((e) => e.propertyId === visit.propertyId);
    return { visit, resolution, date, collisions };
  });
  const days = [p.to, further]
    .map((date) => {
      const existing = p.existing[date] ?? [];
      const incoming = moves.filter((m) => m.date === date).map((m) => m.visit);
      const load = { stops: existing.length + incoming.length, minutes: minutes(existing) + minutes(incoming) };
      return { date, existing, incoming, load, over: incoming.length > 0 && overCapacity(load, p.capacity) };
    })
    // The further day only matters once something is sent there.
    .filter((d) => d.date === p.to || d.incoming.length);
  const collision = moves.some((m) => m.collisions.length);
  const overflow = days.some((d) => d.over);
  const state = !moves.length ? 'empty' : overflow ? 'overflow' : collision ? 'collision' : 'clean';
  return { from: p.from, to: p.to, further, capacity: p.capacity, moves, staying: p.staying, days, collision, overflow, state };
}

export type CascadePlan = ReturnType<typeof planCascade>;

function checkDates(clock: Clock, from: LocalDate, to: LocalDate) {
  if (to <= from) throw new CascadeRefused('Push forward: the target must be after the day');
  if (to < today(clock)) throw new CascadeRefused('The target day is already past');
}

async function readPlan(db: Tx, crewId: string, from: LocalDate, to: LocalDate, choices: Record<string, Resolution>) {
  const crew = await db.crew.findUnique({ where: { id: crewId }, select: { maxStops: true, maxMinutes: true } });
  if (!crew) throw new CascadeRefused(`No crew ${crewId}`);
  const further = nextServiceDay(to);
  const visits = await db.visit.findMany({
    where: { crewId, date: { in: [from, to, further].map(toDbDate) } },
    include: stopInclude,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const on = (d: LocalDate) => visits.filter((v) => fromDbDate(v.date) === d);
  const takesSlot = (v: Stop) => v.status !== 'skipped';
  return planCascade({
    from, to, choices, capacity: crew,
    moving: on(from).filter((v) => v.status === 'pending'),
    staying: on(from).filter((v) => v.status !== 'pending'),
    existing: { [to]: on(to).filter(takesSlot), [further]: on(further).filter(takesSlot) },
  });
}

export async function previewCascade(clock: Clock, crewId: string, from: LocalDate, target: Target, choices: Record<string, Resolution> = {}) {
  const to = resolveTarget(from, target);
  checkDates(clock, from, to);
  return readPlan(prisma, crewId, from, to, choices);
}

/**
 * Apply a previewed push, all or nothing. `expect` is the ids the preview
 * showed moving; if the day holds anything else now, it refuses rather than
 * move visits the dispatcher never saw.
 */
export async function commitCascade(
  clock: Clock,
  crewId: string,
  from: LocalDate,
  target: Target,
  choices: Record<string, Resolution>,
  opts: { expect: string[]; override?: Override },
) {
  if (opts.override && !(opts.override.reason.trim() && opts.override.by.trim())) {
    throw new CascadeRefused('A capacity override needs a reason and who made it');
  }
  const to = resolveTarget(from, target);
  checkDates(clock, from, to);

  return prisma.$transaction(async (tx) => {
    // Same lock as rescheduleVisit: moves into this crew serialize, so loads measured below stay true.
    const [crew] = await tx.$queryRaw<Capacity[]>`
      SELECT "maxStops", "maxMinutes" FROM "Crew" WHERE id = ${crewId} FOR UPDATE`;
    if (!crew) throw new CascadeRefused(`No crew ${crewId}`);

    const plan = await readPlan(tx, crewId, from, to, choices);
    const ids = plan.moves.map((m) => m.visit.id);
    const stale = new CascadeRefused(STALE_MSG);
    if (ids.length !== new Set(opts.expect).size || !ids.every((id) => opts.expect.includes(id))) throw stale;
    if (!ids.length) throw new CascadeRefused('Nothing to push');

    for (const m of plan.moves) {
      // Conditional on what was read: a stop the crew starts mid-commit is not moved, and the whole push rolls back.
      const { count } = await tx.visit.updateMany({
        where: { id: m.visit.id, crewId, date: toDbDate(from), status: 'pending' },
        // Detached keeps its slot in the series; its old route position meant nothing on the new day.
        data: { date: toDbDate(m.date), detached: true, routePosition: null },
      });
      if (count !== 1) throw stale;
    }

    // Measured after the moves, like rescheduleVisit; throwing rolls every move back.
    const overridden: LocalDate[] = [];
    for (const d of plan.days.filter((d) => d.incoming.length)) {
      const load = await dayLoad(tx, crewId, d.date);
      if (!overCapacity(load, crew)) continue;
      if (!opts.override) throw new CapacityExceeded(load, crew);
      overridden.push(d.date);
      await tx.capacityOverride.createMany({
        data: d.incoming.map((v) => ({
          crewId, date: toDbDate(d.date), visitId: v.id, ...load, reason: opts.override!.reason, by: opts.override!.by,
        })),
      });
    }

    // The outbox stub: one notice per affected customer, committed with the move or not at all.
    await tx.notification.createMany({
      data: plan.moves.map(({ visit: v, date }) => {
        const p = v.property;
        return {
          visitId: v.id,
          channel: p.customerEmail ? 'email' : 'sms',
          to: p.customerEmail ?? p.customerPhone,
          body: `Evergreen Property Care: your ${v.serviceType.name} at ${p.address} moved from ${shortDay(from)} to ${shortDay(date)}.`,
        } as const;
      }),
    });

    return { moved: plan.moves.length, to: plan.to, further: plan.further, overridden };
  });
}

/**
 * PX-5: the same push for every crew that has pending stops on `from`, in one
 * pass. Bulk keeps each visit on the target day; per-visit "push further"
 * stays a single-crew decision (its own preview page).
 */
export async function previewAllCrews(clock: Clock, from: LocalDate, target: Target) {
  const to = resolveTarget(from, target);
  checkDates(clock, from, to);
  const crews = await prisma.crew.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  const plans = await Promise.all(crews.map(async (c) => ({ crew: c, plan: await readPlan(prisma, c.id, from, to, {}) })));
  return plans.filter((p) => p.plan.state !== 'empty');
}

export type CrewOutcome = { crewId: string; moved: number; overridden: LocalDate[]; error?: string };

/**
 * N single-crew commits run together, never one transaction across crews: a
 * crew whose day changed (stale) or that needs an override it wasn't given
 * fails alone, and the others still land. `expect` maps crew id to the visit
 * ids its preview showed.
 */
export async function commitAllCrews(
  clock: Clock,
  from: LocalDate,
  target: Target,
  expect: Record<string, string[]>,
  override?: Override,
): Promise<CrewOutcome[]> {
  const out: CrewOutcome[] = [];
  for (const [crewId, ids] of Object.entries(expect)) {
    try {
      const r = await commitCascade(clock, crewId, from, target, {}, { expect: ids, override });
      out.push({ crewId, moved: r.moved, overridden: r.overridden });
    } catch (e) {
      if (!(e instanceof CascadeRefused || e instanceof CapacityExceeded)) throw e;
      out.push({ crewId, moved: 0, overridden: [], error: e.message });
    }
  }
  return out;
}
