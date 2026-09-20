# Groundwork — working conventions

Field service routes and crews for "Evergreen Property Care" (synthetic data
only). Spec: `prd-groundwork-field-service.md`. Decisions: `docs/decisions.md`,
which outranks the PRD where they differ.

## Hard rules

1. **Money is integer cents.** Never a float. A visit snapshots its agreement's
   price at generation, so a later price change cannot rewrite revenue history.
2. **Time comes from an injected clock** (`src/clock.ts`). Dates are
   `LocalDate` strings in America/Chicago (`src/time.ts`); no bare `new Date()`.
3. **State transitions go through the state-machine module** (`src/visits/status.ts`).
   Test fixtures that fake history must write well-formed outcome rows; the
   database checks them.
4. **Coordinates are (lat, lng), in that order, everywhere.** The database
   range-checks both, so a swapped Tulsa point fails on insert.
5. **Generated visits are the source of truth; agreements are patterns.**
   Recurrence is stored as a rule that *generates rows*, not computed on the fly,
   because a rescheduled visit has to be a row that can detach from its pattern.
   Idempotency is keyed on `occurrenceDate` (the slot), never `date` (where it
   sits now) — keying on `date` resurrects rescheduled visits.
6. **Crews never see price.** The crew view is an explicit projection
   (`src/crews/view.ts`); add fields there deliberately.

## Local environment

- Port **3900**, set in `package.json`.
- Postgres is local, always — `groundwork_dev`, `groundwork_test`.
  `DATABASE_URL` carries `?connection_limit=10&pool_timeout=20`.
- `npm test` runs typecheck, then vitest against `.env.test`.
- `npm run test:e2e`: Playwright on a production build, 390px viewport, reseeds
  `groundwork_test` (so never alongside `npm test`).

## Write-up

`WRITEUP.md` is maintained as the project goes. Each core learning artifact
(recurrence engine, route builder, mobile crew view) gets an entry when it
lands: the problem, what the design does, what it deliberately does not do.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
