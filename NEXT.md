# Next

**Back-office Phase 16 (BO-3: `Job` entity + fast-path placement) is
done**, 2026-09-22. `Visit` now carries its own `propertyId`/`serviceTypeId`
(copied from its origin, trigger-enforced), `agreementId` is nullable, new
`jobId`, `CHECK num_nonnulls(agreementId, jobId) = 1`. All 15 reader files
were swept to `v.property`/`v.serviceType`. Form at `/dispatch/jobs/new`,
linked from each crew-day and property page. See `docs/decisions.md` → Phase 16
and WRITEUP.md. `npm test` 111/111, e2e 12/12 on a production build. Walked
through the form against dev data by hand (curl, no-JS encoding). Also fixed a
pre-existing bug: `back()` in agreements/jobs actions doubled `?` when the
path already had a query string, which swallowed the error message.

Two PRDs are active at the repo root, phased independently:

- `prd-groundwork-back-office.md`: **Phase 17 next** (BO-4: Stripe
  invoicing: `Invoice` model, hosted Checkout, signature-verified idempotent
  webhook, report relabel "Scheduled value" vs Invoiced/Collected). Tests must
  use Stripe test mode or recorded fixtures, never live keys. The Stripe
  connector currently needs auth in claude.ai settings if it's wanted.
- `prd-groundwork-portal-ux.md`: not started. Its own Phase 19 (PX-2,
  confirm step on customer cancel/reschedule) is independent of the
  back-office work and could run in parallel if picked up.
- **The two PRDs each number their own phases starting near 14–19 —
  they collide (both have a "Phase 19").** Not reconciled; whoever picks up
  the second track should renumber or just track them as two separate
  sequences by name, not by number.

Known gaps carried forward from before this session, none blocking:

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
  which was the condition for leaving it. BO-3's one-off job placement
  deliberately joins the same exemption (decisions.md, Phase 14 PRD).
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
- **A property can't be hard-deleted once it has any agreement** — v1 has no
  agreement-deletion path (Phase 14). Not a gap called out in either PRD;
  revisit only if a dispatcher actually needs it.
