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

## 2026-09-19 — Phase 3 (mobile crew view)

- **State machine** (`src/visits/status.ts`): pending → en_route → completed, and a skip from pending *or* en_route (a customer can cancel before the crew leaves). Completed and skipped are final for a crew; undoing one is a dispatcher correction, not built yet. No complete-from-pending: the PRD's arrow goes through en_route, and `startedAt` feeds the P2 timesheet.
- **Server-side guards:** a crew can act only on its own visits and only on today's (injected clock). Updates are conditional on the status just read, so of two racing taps exactly one wins. The database also checks outcome shape: a skip has a reason and only a skip does; `startedAt`/`finishedAt` follow status.
- **Skip reasons are an enum** (locked gate, dog loose, customer request, weather, other); free text is optional except for "other".
- **Price gate is a projection, not a role check** (`src/crews/view.ts`): the crew view is built from explicitly listed fields, so price never reaches the page (it is read from the database by `routeFor`, then dropped). A test asserts no "price" key and no price value on the wire.
- **No sign-in yet.** Crews pick themselves at `/crew`. The per-visit crew check is correct but, without auth, not a security boundary. Sign-in lands with the dispatcher UI, when two roles exist to split. Synthetic data only.
- **Photos on local disk** under `uploads/` (gitignored), type sniffed from the bytes, file named by the server, 10 MB cap. Will not survive a serverless deploy; blob storage replaces `savePhoto` when the app is hosted. Photos are stored, not yet displayed (the dispatcher view needs them first).
- **No client JS for the flow:** server actions + native `<details>` and `required` radios. It works on a bad connection with a half-loaded page, and each post redirects so a reload never resubmits.
- **e2e:** Playwright against `next build && next start`, 390×844 touch viewport, one worker, global setup reseeds `groundwork_test` and refuses any other database. Runs in CI after vitest.

## 2026-09-20 — Phase 4 (rain-day cascade + dispatch board)

- **Preview is a GET, commit is a POST.** All preview inputs (target, per-visit
  resolution) are query parameters, so the preview re-runs from the URL and has
  no state of its own. Two forms on the page: a plain GET submit re-previews, a
  server action commits.
- **Five preview states, named in the module doc:** empty / clean / collision /
  overflow / stale. "Collision" is *the same property* already booked on the
  landing day, not merely a busy day — a busy day is overflow, which is a
  capacity question with a different answer.
- **Only pending visits move.** En-route, completed and skipped stay; a crew
  that already started a stop skips it from the phone with reason `weather`.
- **"Push further" means the next service day after the target** (Mon–Fri,
  fixed for now), one hop only. Arbitrary per-visit dates are a scheduling UI,
  not a rain day.
- **Commit re-reads and re-plans inside the transaction**, and refuses unless
  the day still holds exactly the visit ids the preview showed (`expect`).
  Capacity is measured after the moves, as `rescheduleVisit` does, with the
  crew row locked `FOR UPDATE` so the two paths serialize against each other.
- **Overflow logs one `CapacityOverride` per landed visit**, same shape as a
  single-visit override, so the audit trail has one format.
- **Notifications are a transactional outbox** (`Notification`, written in the
  cascade's transaction, `sentAt` null forever in v1). A notice cannot exist
  for a move that rolled back.
- **Failure injection is a database trigger, not a mock:** the test raises from
  Postgres on the last visit update, and separately on the outbox insert, then
  asserts an unchanged snapshot. Mocking would have tested the mock.
- **The Phase 2 gap stays open, deliberately:** horizon generation and an
  agreement crew change are still not capacity-checked. Neither is a dispatcher
  placing a visit; the board colours the result, which is the visibility the
  gap was waiting for.
- **Sign-in is a dev role switcher** (`src/session.ts`, cookie only, no
  password), the clearpath seam. The split it enforces is real: dispatcher
  pages and the photo route check the role, crew actions take the crew id from
  the session instead of the form. Real auth replaces one file.
- **Photos are served by a route that only a dispatcher can call**, with the
  file name matched against exactly what `savePhoto` writes.
- **Board polls every 10s** with `router.refresh()` (no cursor; the query is
  three joins over a week). Countertop's cursor endpoint is the upgrade if it
  ever costs anything.
- **Seed grows to 120 properties** so a crew-day carries ~6 of 8 stops: pushing
  one day onto the next has to overflow, or the demo shows nothing.
- **`npm run rain-day -- --crew=Midtown [--commit]`** is the capstone demo:
  preview printed, commit optional, and it reports visit counts before/after so
  "zero lost visits" is checked, not asserted.

## 2026-09-20 — Phase 5, P1-2 (owner report)

- **Completion rate is out of what was *resolved*** (completed + skipped), not
  out of everything scheduled. The other denominator makes a week that has not
  happened yet read as 0% — a number that looks like failure and means
  "Tuesday". Open visits are reported beside the rate instead, so the reader
  can see what is still out.
- **Revenue is completed visits at the visit's snapshotted `priceCents`.** The
  test raises every agreement's price after the fact and asserts the week's
  revenue does not move; that is the hard rule made checkable.
- **Miles include skipped stops.** The crew drove the route that was
  dispatched, and a locked gate does not refund the drive. Same straight-line
  estimate the route page shows, labelled as an estimate on both.
- **One ordering function, two callers** (`drivenOrder` in `routes/route.ts`).
  The report needed the *driven* order to get miles right, which is the rule
  the route page already owned: manual if any visit carries a position,
  nearest-neighbor otherwise. Extracted rather than copied, and the test
  asserts the report's miles equal `routeFor`'s — the one number with two
  implementations.
- **One query for the week, grouped in memory**, like `weekBoard`. Calling
  `routeFor` per crew-day would have been 42 queries for a three-crew week.
- **The seed now carries four weeks of history**, or the report has nothing to
  report. `HISTORY_DAYS = 28` is chosen, not rounded to: it is a whole number
  of weekly, biweekly *and* every-4-week periods, so backdating the recurring
  agreements leaves the current week's book byte-for-byte what it was (miles
  per crew were identical before and after). One-time jobs stay on this week —
  moved back they would just vanish from it.
- **The backfill writes outcome rows directly**, and only for visits before
  today. Directly because the state machine moves *today's* visits by design;
  before-today so every future visit stays pending and the rain-day demo is
  untouched. The database's shape checks apply to a fixture exactly as they do
  to a crew, which is what makes the direct write safe.
