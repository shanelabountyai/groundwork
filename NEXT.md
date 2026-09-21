# Next

**P2 #2 (real SMS/email provider) is done**, 2026-09-21:
`src/notifications/provider.ts` now sends through Twilio (SMS) and Resend
(email) via plain `fetch`, gated per-channel on env presence
(`TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER`,
`RESEND_API_KEY`/`RESEND_FROM_EMAIL`) — unconfigured channels fall back to
`consoleProvider`, same shape as the Blob/local split in `photos.ts`.
`drainOutbox`'s default changed from `consoleProvider` to `defaultProvider`;
`drainOutbox` itself is untouched. `.env.example` documents the five new
vars (names only). See `docs/decisions.md` → Phase 8.
Typecheck, `npm test` (71/71), all green. e2e not re-run (no e2e-visible
change — notifications aren't asserted there).

**Next up**, in `docs/design-brief.md` → P2, ordered by what unblocks a real
deploy:

1. **Real auth** — replaces `src/session.ts`. The role split it enforces
   (dispatcher vs. crew) is already the real boundary; this is swapping the
   identity source, not redesigning authorization.
2. **Real routing API** — behind `src/routes/route.ts::estimate`'s existing
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
  this repo (there's no deploy target). Wire it up when real auth (#1) or
  a scheduler exists.
- **Horizon generation and agreement crew changes still skip the capacity
  check** (decisions.md, Phase 2 and 4). The board now colours the overload,
  which was the condition for leaving it.
- **The owner report has no export and no range beyond a week** — deliberate;
  see decisions.md, Phase 5.
- **The make-up offer has no override and looks 14 days ahead** — deliberate;
  see decisions.md, Phase 5, P1-1. A crew with no open slot inside the horizon
  is told to move it by hand.
