# Decisions

Dated. Outranks the PRD where they differ.

## 2026-09-19 — Kickoff

- **Stack:** Next 16 + Prisma 7 (pg adapter) + local Postgres + Vitest, matching clearpath. Port 3900.
- **Reuse (Session 0):** `reuse-scan.py` found no real matches (only storage business is indexed). Lifted from clearpath instead: `src/clock.ts` verbatim, `db.ts` and the test harness pattern, and the recurrence planner (`scheduling/recurrence.ts`) adapted. Anchored on the start date, not a weekday, with four frequencies. Groundwork owns its copy; the two diverge freely.
- **Recurrence stored as rule + generated rows** (PRD open question, resolved): generated rows make reschedule-detachment tractable.
- **Horizon is inclusive, 28 days:** the PRD's own example (biweekly from Mar 2 reaches Mar 30) requires it.
- **Obsolete future visits are deleted, not cancelled:** a pending, attached, future visit has no history, and deleting it frees its slot if the pattern returns to it.
- **Detached visits survive pattern edits:** a person placed them.
- **Price snapshotted on each visit** (not in PRD): keeps revenue per week (P1-2) honest across price changes.
- **Model:** Opus for Phase 1 — the recurrence engine is correctness-critical.

## 2026-09-19 — Phase 2 (capacity + route builder)

- **"Touched" is derived, not a flag:** a day is manual iff any of its visits has a `routePosition`. No `RouteDay` table. The cost: every path that moves a visit to another crew-day must null its position (`rescheduleVisit`, crew change in `editAgreement`). P0-6's cascade must do the same.
- **Untouched days are ordered on read, not persisted:** visits that arrive later slot into the nearest-neighbor order for free. "Re-request auto-order" = clear the day's positions.
- **On a manual day, late arrivals sort last** (by creation). The dispatcher places them; auto-order stays out.
- **Route is a round trip** (home → stops → home), in miles. Estimate = straight-line × `GROUNDWORK_ROAD_FACTOR` (default 1.3) at 25 mph; always labelled an estimate.
- **Capacity counts every non-skipped visit** (pending, en route, completed) against max stops *and* max minutes. Checked after the move inside one transaction with the crew row locked `FOR UPDATE`, so concurrent moves serialize. An override needs a non-blank reason and author and is logged in `CapacityOverride` with the load it caused.
- **Not capacity-checked (deliberately, for now):** horizon generation and an agreement-level crew reassignment. Neither is a dispatcher placing one visit on one day; the weekly board (P0-7) colours those overloads. Revisit with the cascade.
- **Crew members skipped** until the crew view needs sign-in (Phase 3).
- **Seed** (`npm run db:seed [-- --reset]`): 3 regional crews, 40 properties, deterministic PRNG, refuses production and non-local databases.
