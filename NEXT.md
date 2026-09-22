# Next

**Back-office Phase 18 (BO-8: per-person clock in/out) is done**, 2026-09-22.
`TimeEntry` (one open shift per user, enforced by a partial unique index),
Clock in / Clock out on the crew phone view, and the timesheet CSV now leads
with hours per person per day, followed by the per-visit block ("Hours on
site"). See `docs/decisions.md` → Phase 18 and WRITEUP.md. `npm test`
131/131, e2e 13/13 on a production build.

Phase 17 (Stripe) is still **not exercised against real Stripe test mode** —
no keys in any env file. To demo: `STRIPE_SECRET_KEY=sk_test_…` in `.env`,
`stripe listen --forward-to localhost:3900/stripe/webhook`, and the `whsec_…`
it prints into `STRIPE_WEBHOOK_SECRET`.

Two PRDs are active at the repo root, phased independently:

- `prd-groundwork-back-office.md`: **Phase 19 next** (BO-6 search, BO-7
  crew-day messaging, BO-9 extended reporting). The last back-office phase.
- `prd-groundwork-portal-ux.md`: not started. Its own Phase 19 (PX-2,
  confirm step on customer cancel/reschedule) is independent of the
  back-office work and could run in parallel if picked up.
- **The two PRDs each number their own phases starting near 14–19 —
  they collide (both have a "Phase 19").** Not reconciled; whoever picks up
  the second track should renumber or just track them as two separate
  sequences by name, not by number.

Known gaps carried forward, none blocking:

- **Timesheet has no "who completed this visit" column** — the PRD assumed
  one existed; visits record the crew only (decisions.md, Phase 18).

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
