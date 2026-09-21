# Next

**P2 #4 (real routing API) is done**, 2026-09-21: `estimateDrive`
(`src/routes/routing.ts`) calls OSRM for real drive miles/minutes behind
`route.ts::estimate`'s `{ miles, driveMinutes }` shape, gated on
`OSRM_BASE_URL` — unset (local dev, e2e, CI) falls back to the existing
straight-line estimate with no network call. Stop order is untouched
(nearest-neighbor/manual); only the mileage/time number changes. Every
failure mode (unset, network error, timeout, non-2xx, empty route) falls back
silently. See `docs/decisions.md` → Phase 10. `npm test` 82/82, e2e 12/12.

**To turn it on:** set `OSRM_BASE_URL` in `.env.local` (or production env) to
a self-hosted/hosted OSRM instance. The public demo
(`https://router.project-osrm.org`) works for a quick check but is rate
limited — not for real traffic.

**Next up**, in `docs/design-brief.md` → P2, remaining in priority order:

1. **2-opt pass** over nearest-neighbor (`src/routes/route.ts`) — same
   module, additive, no interface change.
2. **Timesheet export** — derived from `startedAt`/`finishedAt`, already on
   every `Visit`. Pure reporting, no new writes.
3. **Customer portal** — tokenized-link pattern (reuse the magic-link shape,
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
