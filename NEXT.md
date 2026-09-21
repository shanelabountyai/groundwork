# Next

**All of P1 is done** (`prd-groundwork-field-service.md`, Phase 5). P1-3
(notification preferences per property — `Property.notifyOnEnRoute`, gated
in `src/visits/status.ts`) landed 2026-09-20, alongside P1-1, P1-2, P1-4.

**Next up is P2**, ordered in `docs/design-brief.md` → P2 section by what
unblocks a real deploy vs. what's a feature. First item there: an outbox
drainer (worker that ships rows where `sentAt IS NULL`) — it's what makes
every notification already being written, P1-3 included, actually fire.

A full architecture/build-out map lives in `docs/design-brief.md`.

Known gaps, none blocking:

- **`next dev` appends a `nextjs-agent-rules` block to `CLAUDE.md`.** Decided
  2026-09-20: committed, so the tree stays clean when the tool re-adds it.
  Leave it in place.
- **Route reorder is ↑/↓ buttons, not drag** (P0-4 says drag). Buttons need no
  client JS and work on a phone; drag would be the first real client component.
- **Outbox is never drained.** `Notification.sentAt` is always null; a worker
  (and a provider) is the upgrade.
- **Horizon generation and agreement crew changes still skip the capacity
  check** (decisions.md, Phase 2 and 4). The board now colours the overload,
  which was the condition for leaving it.
- **The owner report has no export and no range beyond a week** — deliberate;
  see decisions.md, Phase 5.
- **The make-up offer has no override and looks 14 days ahead** — deliberate;
  see decisions.md, Phase 5, P1-1. A crew with no open slot inside the horizon
  is told to move it by hand.
