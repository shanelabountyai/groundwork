# Next

**Customer portal (P2 #7) is done**, 2026-09-21: `src/portal/session.ts`
(magic-link, same shape as `src/session.ts`, scoped to a `Property` via new
`PortalToken`/`PortalSession` tables) + `src/portal/view.ts` (a property's
upcoming open visits, with price) + `app/portal/` (request link, `[token]`
confirm, schedule + self-serve cancel). Cancel goes through a new
`customerSkip` in `src/visits/status.ts` — property-scoped, pending-only, no
same-day limit, same `canTransition` table as the crew's `transition`. See
`docs/decisions.md` → Phase 13. `npm test` 100/100. Manually walked the full
flow in a real browser (request → link → confirm → schedule → cancel →
cancelled visit drops off on reload) against dev data; confirmed in Postgres.

**That was the last item in `docs/design-brief.md`'s P2 list — all of P0,
P1, and P2 are done.** Nothing queued. Next session: check with the user for
a new phase, or treat the PRD/design-brief as complete and look for
polish/known-gaps work below.

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
- **The portal shows one property per customer** — a customer with more than
  one property signs into one at a time (decisions.md, Phase 13). No report
  of anyone needing multi-property login; revisit if that changes.
- **Property phone/email aren't stored normalized**, unlike `User`'s. The
  portal login does an in-JS digits-only scan instead (decisions.md, Phase
  13, `ponytail:` note in `src/portal/session.ts`) — fine at this table's
  size, add a normalized indexed column if it stops being fine.
