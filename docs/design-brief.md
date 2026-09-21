# Design brief — full build-out

One entry point for picking this project up cold: current state, architecture,
what's left, and where to look. Full detail lives in `prd-groundwork-field-service.md`
(requirements) and `docs/decisions.md` (dated, outranks the PRD). This doc
doesn't repeat either — it's the map between them and the code.

## What's built (2026-09-20)

All of P0 (Phase 1-4) plus all of P1. Remaining: P2.

| Phase | Scope | Status |
|---|---|---|
| 1 | Properties, agreements, recurrence engine | done |
| 2 | Crews, capacity, route builder (haversine nearest-neighbor) | done |
| 3 | Mobile crew view, visit state machine, role split | done |
| 4 | Rain-day cascade, dispatch board | done |
| 5 (P1-2) | Owner report (completion/revenue/miles per crew per week) | done |
| 5 (P1-1) | Skip → make-up offer | done |
| 5 (P1-4) | Multi-visit properties render adjacent | done (no code change) |
| 5 (P1-3) | Notification preferences per property | done |
| — | P2 (real routing, timesheets, customer portal, 2-opt) | not started |

## Architecture

- **Stack:** Next 16 (App Router, `app/`) + Prisma 7 pg adapter + local
  Postgres + Vitest + Playwright. Port 3900, fixed (`package.json`).
- **No client state framework.** Server actions + native HTML (`<details>`,
  `required` radios). No client JS on the crew flow by design — works on a
  bad connection, no double-submit (`docs/decisions.md`, Phase 3).
- **Auth:** dev role switcher (`src/session.ts`), cookie only, no password.
  Real auth replaces one file — the role checks it enforces are already real.
- **Photos:** local disk under `uploads/` (gitignored), 10 MB cap, type
  sniffed from bytes. Won't survive a serverless deploy — P2 swaps
  `savePhoto` for blob storage.
- **Notifications:** transactional outbox (`Notification` table), never
  drained — `sentAt` is always null. A worker + provider is the P1-3/P2 seam.

### Module map

```
app/                        routes (App Router; root-level, not src/app)
  page.tsx                  home
  dispatch/                 dispatcher: board, per-crew-day route, cascade push, report
  crew/[crewId]/            mobile crew view
  photos/                   dispatcher-only photo serving route
src/
  clock.ts                  injected clock — no bare `new Date()`
  time.ts                   LocalDate strings, America/Chicago
  money.ts                  integer-cents helpers
  db.ts                     Prisma client
  session.ts                dev role switcher
  visits/
    recurrence.ts           rule → occurrence dates (core learning artifact #1)
    generate.ts             horizon job, idempotent on occurrenceDate
    status.ts               the ONLY place a visit's status changes
    cascade.ts              rain-day preview + transactional commit
    makeup.ts               skip → make-up offer + booking
    photos.ts               save/validate uploaded photos
  crews/
    capacity.ts             overCapacity check, shared by rescheduleVisit/cascade/makeup
    board.ts                weekly board query (one query, grouped in memory)
    view.ts                 crew-facing projection — price is dropped here
    report.ts               owner report (completion/revenue/miles)
  routes/
    route.ts                haversine, nearestNeighbor, drivenOrder, estimate
    day.ts                  per-crew-day route assembly
prisma/schema.prisma         source of truth for the data model
scripts/
  seed.ts                   3 crews, 120 properties, 4 weeks of history, refuses non-local DBs
  visits-generate.ts        horizon job entry point
  rain-day.ts               capstone demo — preview + optional --commit
```

### Data model (see `prisma/schema.prisma` for the annotated version)

`Property` —< `Agreement` (frequency, priceCents, crew) —< `Visit`
(occurrenceDate = slot, date = where it sits now, status, routePosition,
detached, priceCents snapshot) —< `Notification`. `Crew` has home lat/lng,
maxStops, maxMinutes and —< `CapacityOverride` (logged, needs reason + author).

The two dates on `Visit` are the whole recurrence design: `occurrenceDate`
never moves and is what generation keys on (`@@unique([agreementId,
occurrenceDate])`); `date` is where a reschedule or cascade put it. Get these
backwards and regeneration resurrects rescheduled visits — CLAUDE.md hard
rule 5, and the reason it's a hard rule.

### Conventions that must carry into every remaining item

From `/Users/shanelabounty/Projects/groundwork/CLAUDE.md` — not restated here
beyond a pointer, because drifting a copy is how a rule goes stale:

1. Money is integer cents, always.
2. Time from the injected clock; `LocalDate` strings, not bare `Date`.
3. State transitions go through `src/visits/status.ts` only.
4. Coordinates are `(lat, lng)`, never swapped.
5. Generated visits are the source of truth; agreements are patterns.
6. Crews never see price — it's dropped in `src/crews/view.ts`, not
   role-checked at render time.

## Remaining build-out

### P1-4 — multi-visit properties (done, no code change)

Two agreements on one property share lat/lng, and `nearestNeighbor`
(`src/routes/route.ts`) already seats identical-coordinate stops adjacently
on auto-ordered days: once one is visited, the other is at distance 0 and
wins every tie. Confirmed with a test rather than left as an inference from
reading the code (`route.test.ts`). Manual (dragged) days are unaffected,
deliberately — see `docs/decisions.md`, Phase 5 P1-4.

### P1-3 — notification preferences per property

- Add a preference field to `Property` (e.g. `notifyOnEnRoute: Boolean`,
  default matching current behavior) — one migration.
- `en_route` transition in `src/visits/status.ts` is the single choke point
  every visit's status already passes through; gate the outbox write there,
  not per-caller.
- The outbox itself is unchanged — still writes `Notification`, still never
  sends. Don't build a sender for this; that's P2's "real provider" seam,
  and building it early duplicates work once a provider is chosen.
- Test: preference off → transition produces no `Notification` row; on →
  it does, same shape as today.

### P2 (ordered by what unblocks a real deploy vs. what's a feature)

1. **Blob storage for photos** — `uploads/` doesn't survive serverless.
   Swap point is `src/visits/photos.ts::savePhoto`; the photo route
   (`app/photos/`) and the DB columns (string paths) don't need to change if
   the blob URL scheme stays path-like.
2. **Outbox worker + real provider** (SMS/email) — drains `Notification`
   rows where `sentAt IS NULL`. This is what makes P1-3 (and every existing
   `en_route`/rain-day notification already being written) actually fire.
   Cron or a queue; either sits outside the request path deliberately.
3. **Real auth** — replaces `src/session.ts`. The role split it enforces
   (dispatcher vs. crew) is already the real boundary; this is swapping the
   identity source, not redesigning authorization.
4. **Real routing API** — behind `src/routes/route.ts::estimate`'s existing
   interface (`{ miles, driveMinutes }`). `routeMiles`/`nearestNeighbor` stay
   as the no-API fallback.
5. **2-opt pass** over nearest-neighbor — same module, additive.
6. **Timesheet export** — derived from `startedAt`/`finishedAt`, already on
   every `Visit`. Pure reporting, no new writes.
7. **Customer portal** — tokenized-link pattern (reuse, not new design);
   view schedule, request skip. Needs its own auth story (a token, not a
   role), separate from #3.

## Known gaps carried forward (not blocking, tracked in `NEXT.md`)

- Route reorder is buttons, not drag (PRD asks for drag; buttons need no
  client JS and work one-handed on a phone — deliberate trade, revisit if a
  dispatcher actually asks for drag).
- Horizon generation and agreement crew-reassignment skip the capacity
  check; the board colours the result instead. Revisit if cascade logic
  changes.
- Owner report has no export and no range beyond a week (deliberate, see
  `docs/decisions.md` Phase 5).
- Make-up offer has no override and a 14-day horizon (deliberate, see
  `docs/decisions.md` Phase 5 P1-1).

## Where to look first, by task type

- **New data field:** `prisma/schema.prisma` → migration → touch every place
  that already reads that model's full row (grep the model name — Prisma
  gives no field-level compile error for an unused new column, so this is
  a manual sweep, not automatic).
- **New status-adjacent behavior:** `src/visits/status.ts` first. If the
  behavior doesn't need a choke point there, it's probably not a status
  concern.
- **New report/aggregate number:** `src/crews/report.ts` or `board.ts` for
  the one-query-grouped-in-memory pattern; don't add a per-crew-day query
  loop (the Phase 5 decision log has the N+1 it replaced).
- **Anything touching route order or miles:** `src/routes/route.ts`'s
  `drivenOrder` is the one function two callers (route page, owner report)
  both use so their numbers can't disagree. Extend it, don't fork it.
