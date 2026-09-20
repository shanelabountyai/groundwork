# Next

**Phase 5 — P1 items** (`prd-groundwork-field-service.md`). P1-2 (owner report)
landed 2026-09-20. Remaining, in this order:

- **P1-1 skip → auto-offer reschedule:** a skipped visit offers the crew's next
  capacity-legal slot. `previewCascade` already computes per-day load; the offer
  is the same check for one visit.
- **P1-4 multi-visit properties:** two agreements on one property should render
  as adjacent stops. The route builder orders by distance, so identical
  coordinates already land together — confirm, then decide if that is enough.
- **P1-3 notification preferences** per property; `en_route` fires the outbox.

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
