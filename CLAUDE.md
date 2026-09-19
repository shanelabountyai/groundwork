# Groundwork — working conventions

Field service routes and crews for "Evergreen Property Care" (synthetic data
only). Spec: `prd-groundwork-field-service.md`. Decisions: `docs/decisions.md`,
which outranks the PRD where they differ.

## Hard rules

1. **Money is integer cents.** Never a float. A visit snapshots its agreement's
   price at generation, so a later price change cannot rewrite revenue history.
2. **Time comes from an injected clock** (`src/clock.ts`). Dates are
   `LocalDate` strings in America/Chicago (`src/time.ts`); no bare `new Date()`.
3. **State transitions go through the state-machine module** (arrives with P0-5).
4. **Coordinates are (lat, lng), in that order, everywhere.** The database
   range-checks both, so a swapped Tulsa point fails on insert.
5. **Generated visits are the source of truth; agreements are patterns.**
   Recurrence is stored as a rule that *generates rows*, not computed on the fly,
   because a rescheduled visit has to be a row that can detach from its pattern.
   Idempotency is keyed on `occurrenceDate` (the slot), never `date` (where it
   sits now) — keying on `date` resurrects rescheduled visits.
6. **Crews never see price.** Role-gate it when the crew view lands.

## Local environment

- Port **3900**, set in `package.json`.
- Postgres is local, always — `groundwork_dev`, `groundwork_test`.
  `DATABASE_URL` carries `?connection_limit=10&pool_timeout=20`.
- `npm test` runs typecheck, then vitest against `.env.test`.
- e2e (Playwright, production build) arrives with the first UI in Phase 3.

## Write-up

`WRITEUP.md` is maintained as the project goes. Each core learning artifact
(recurrence engine, route builder, mobile crew view) gets an entry when it
lands: the problem, what the design does, what it deliberately does not do.
