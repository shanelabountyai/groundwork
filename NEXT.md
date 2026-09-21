# Next

**P2 #1 (real auth) is done**, 2026-09-21: magic-link sign-in replaces the
dev role switcher (`src/session.ts`). SMS for crew leads, email for dispatchers,
sent through the existing provider. Hashed single-use tokens, database-backed
sessions. The role checks (`requireDispatcher`, `requireCrew`, `currentRole`)
keep the same signatures. New env var: `APP_URL`. See `docs/decisions.md` →
Phase 9. `npm test` 77/77, e2e 12/12.

**Your local dev database has no users until you reseed it:**
`npm run db:seed -- --reset`. That wipes and rebuilds the synthetic data. Then
sign in as `dispatch@evergreen.example` or a crew lead at `+19185550150`–`152`.
The link prints in the `npm run dev` console.

**Next up**, in `docs/design-brief.md` → P2, ordered by what unblocks a real
deploy:

1. **Real routing API** — behind `src/routes/route.ts::estimate`'s existing
   interface (`{ miles, driveMinutes }`). `routeMiles`/`nearestNeighbor` stay
   as the no-API fallback.

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
