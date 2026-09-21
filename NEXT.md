# Next

**Phase 5 — P1 items** (`prd-groundwork-field-service.md`). P1-2 (owner report),
P1-1 (skip → make-up offer), and P1-4 (multi-visit properties — no code
change needed, confirmed by test) landed 2026-09-20. Remaining:

- **P1-3 notification preferences** per property; `en_route` fires the outbox.
  See `docs/design-brief.md` → Remaining build-out → P1-3 for the shape
  (one migration, gate in `src/visits/status.ts`, no sender — that's P2).

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
