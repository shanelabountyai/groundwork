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
