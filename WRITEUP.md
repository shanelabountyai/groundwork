# Project Write-Up: Groundwork

> Portfolio write-up template. One per shipped project. Update the "Last synced" line every time the repo changes materially — a stale write-up is worse than none.

**Repo:** [link]
**Live demo:** [link]
**Built with:** Claude Code + Next.js, Prisma, Postgres
**Status:** Shipped [date] · Last synced: [date]

---

## The Business Problem

2–3 sentences. What kind of business, what breaks without software, who feels the pain. Written for a non-technical reader — this is the section a hiring manager or client actually reads.

## What I Built

- Bullet the shipped capabilities in user terms ("customers can book a slot without calling"), not implementation terms ("built a REST endpoint")
- 4–7 bullets max
- Screenshot or short GIF here — one image outperforms every paragraph

## How It's Built

One short paragraph: stack, data model highlights, architecture choices worth naming. Then:

**Key design decisions**
| Decision | Alternative considered | Why I chose it |
|---|---|---|
| e.g., money stored as integer cents | floats | float rounding corrupts billing math |

## Skills Learned / Functions Unlocked

The section this whole portfolio exists for. Be specific:
- **[Feature family]** — what it is, why it was new to me, where it shows up in the code (link to file/module)
- Aim for 3–5 entries; link each to the actual code that proves it

## The Hardest Bug

The credibility section. Tell one real story: what broke, how it manifested, how I found it, what fixed it, what I'd instrument next time. Polished write-ups without a failure story read as AI-generated.

## What I'd Do Differently

2–3 honest items. Scope cuts, architecture regrets, things v2 would change.

## By the Numbers

- Lines of code / test count / coverage %
- Build time (calendar days, sessions)
- Anything measurable from the seed data or demo

---

*Part of my Claude Code build log: [link to build-log page]*

---

## Build log

### Recurrence engine (Phase 1) — 2026-09-19

**Problem:** agreements (weekly / biweekly / every 4 weeks / one-time) must
fill the calendar four weeks ahead, re-running must never duplicate, and a
rescheduled visit must never reappear on the date it left.

**Design:** a pure planner (`src/visits/recurrence.ts`) diffs the pattern
against existing visits keyed on `occurrenceDate`, the slot the pattern
produced, which a reschedule never changes. A unique index on
(agreement, occurrenceDate) enforces the same thing in the database, so the
guard is doubled: mutating the planner to key on `date` fails the unit test,
while the integration test still passes on the index alone.

**Deliberately not:** computed-on-the-fly occurrences (a reschedule needs a
row to detach), or cancelling withdrawn future visits (deleted, since they
have no history).

### Route builder (Phase 2) — 2026-09-19

**Problem:** each crew-day needs a sensible stop order without backtracking,
but dispatchers won't trust an algorithm they can't override, and an
override that silently gets re-optimized is worse than none.

**Design:** a pure module (`src/routes/route.ts`) does haversine distance and
greedy nearest-neighbor from the crew's yard; tested on three 8-stop Tulsa
fixtures that it never loses to creation order. Persistence
(`src/routes/day.ts`) stores nothing for an untouched day, which is re-ordered
on every read, and a `routePosition` per visit once a dispatcher drags. The
presence of any position *is* the "touched" flag, so there is no second
source of truth to drift; moving a visit clears its position so it can't
mark its new day as touched. Distance is shown as an estimate (straight-line
× road factor), never as drive time.

**Deliberately not:** a VRP solver or 2-opt pass (P2), a routing API, or
persisting the auto order. Capacity overrides (`src/crews/capacity.ts`) are
checked after the move in a transaction holding the crew row lock, so a
refused move rolls back and two concurrent moves can't both squeeze in.
