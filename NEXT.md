# Next

**P2 #1 (2-opt pass) is done**, 2026-09-21: `twoOpt` (`src/routes/route.ts`)
refines `nearestNeighbor`'s tour by reversing segments while that shortens
the round trip, standard 2-opt, home fixed at both ends. Wired into
`drivenOrder`'s auto branch only — a dispatcher's manual order is untouched.
See `docs/decisions.md` → Phase 11. `npm test` 89/89.

**P2 #4 (real routing API) is done**, 2026-09-21: `estimateDrive`
(`src/routes/routing.ts`) calls OSRM for real drive miles/minutes behind
`route.ts::estimate`'s `{ miles, driveMinutes }` shape, gated on
`OSRM_BASE_URL` — unset (local dev, e2e, CI) falls back to the existing
straight-line estimate with no network call. Stop order is untouched
(nearest-neighbor/manual); only the mileage/time number changes. Every
failure mode (unset, network error, timeout, non-2xx, empty route) falls back
silently. See `docs/decisions.md` → Phase 10.

**To turn OSRM on:** set `OSRM_BASE_URL` in `.env.local` (or production env)
to a self-hosted/hosted OSRM instance. The public demo
(`https://router.project-osrm.org`) works for a quick check but is rate
limited — not for real traffic.

**Timesheet export is done**, 2026-09-21: `timesheetRows`
(`src/crews/timesheet.ts`) returns one row per completed visit in a week
(hours from `startedAt`/`finishedAt`); `GET /dispatch/timesheet?week=` (route
handler, dispatcher-gated) streams it as CSV. Linked from the owner report
page's nav ("Timesheet CSV"). `skipped` visits are excluded — they have
`finishedAt` but never `startedAt`. See `docs/decisions.md` → Phase 12.
`npm test` 90/90.

**Next up**, in `docs/design-brief.md` → P2:

1. **Customer portal** — tokenized-link pattern (reuse the magic-link shape,
   not a new design); view schedule, request skip. Needs its own auth story
   (a token, not a role), separate from crew/dispatcher auth.

A full architecture/build-out map lives in `docs/design-brief.md`.

Known gaps, none blocking:

- **`next dev` appends a `nextjs-agent-rules` block to `CLAUDE.md`.** Decided
  2026-09-20: committed, so the tree stays clean when the tool re-adds it.
  Leave it in place.
- **Route reorder is ↑/↓ buttons, not drag** (P0-4 says drag). Buttons need no
  client JS and work on a phone; drag would be the first real client component.
- **Nothing calls `npm run outbox:drain` yet** — no cron is configured in
  this repo (there's no deploy target). Wire it up when a
  scheduler/deploy target exists.
- **Horizon generation and agreement crew changes still skip the capacity
  check** (decisions.md, Phase 2 and 4). The board now colours the overload,
  which was the condition for leaving it.
- **The owner report has no export and no range beyond a week** — deliberate;
  see decisions.md, Phase 5.
- **The make-up offer has no override and looks 14 days ahead** — deliberate;
  see decisions.md, Phase 5, P1-1. A crew with no open slot inside the horizon
  is told to move it by hand.
