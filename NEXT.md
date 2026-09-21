# Next

**P2 #2 (outbox drainer half) is done**, 2026-09-20: `scripts/outbox-drain.ts`
(`npm run outbox:drain`) drains `Notification` rows with `sentAt IS NULL`
through `src/notifications/drain.ts` → `src/notifications/provider.ts`. The
provider is `console.log` — no real SMS/email account exists yet, so that's
the swap point, not a finished feature. See `docs/decisions.md` → Phase 6.

**Next up**, in `docs/design-brief.md` → P2, ordered by what unblocks a real
deploy:

1. **Blob storage for photos** — `uploads/` doesn't survive serverless.
   Swap point: `src/visits/photos.ts::savePhoto`.
2. **Real SMS/email provider** — the other half of #2. Drop a real
   implementation into `src/notifications/provider.ts`'s `Provider`
   interface; `drainOutbox` doesn't change.
3. **Real auth** — replaces `src/session.ts`.
4. **Real routing API** — behind `src/routes/route.ts::estimate`.

A full architecture/build-out map lives in `docs/design-brief.md`.

Known gaps, none blocking:

- **`next dev` appends a `nextjs-agent-rules` block to `CLAUDE.md`.** Decided
  2026-09-20: committed, so the tree stays clean when the tool re-adds it.
  Leave it in place.
- **Route reorder is ↑/↓ buttons, not drag** (P0-4 says drag). Buttons need no
  client JS and work on a phone; drag would be the first real client component.
- **Nothing calls `npm run outbox:drain` yet** — no cron is configured in
  this repo (there's no deploy target). Wire it up when #3 (real deploy) or
  a scheduler exists.
- **Horizon generation and agreement crew changes still skip the capacity
  check** (decisions.md, Phase 2 and 4). The board now colours the overload,
  which was the condition for leaving it.
- **The owner report has no export and no range beyond a week** — deliberate;
  see decisions.md, Phase 5.
- **The make-up offer has no override and looks 14 days ahead** — deliberate;
  see decisions.md, Phase 5, P1-1. A crew with no open slot inside the horizon
  is told to move it by hand.
