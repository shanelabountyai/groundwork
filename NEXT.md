# Next

**Back-office Phase 17 (BO-4: Stripe invoicing) is done**, 2026-09-22.
`Invoice` (one property's completed visits, amount fixed at build time),
`Visit.invoiceId`, `StripeEvent` for webhook idempotency, and
`Notification.visitId` is now nullable. Pages are at `/dispatch/invoices`
(filter → tick visits → one draft per property → send / mark paid / void),
there is a portal "Pay" button to Stripe-hosted Checkout, and a signed
webhook at `/stripe/webhook`. The report column is now "Scheduled value",
with "Invoiced/Collected this week" beneath it. There is no Stripe SDK:
`src/billing/stripe.ts` is fetch + HMAC. See `docs/decisions.md` → Phase 17
and WRITEUP.md. `npm test` 129/129, e2e 12/12 on a production build. The
webhook was hand-checked against the production build: bad or missing
signature → 400, signed fixture → paid, replay → `duplicate`, and the report
showed the collected amount.

**Not yet exercised against real Stripe test mode.** No keys exist in any
env file. To demo: put `STRIPE_SECRET_KEY=sk_test_…` in `.env`, run
`stripe listen --forward-to localhost:3900/stripe/webhook`, and put the
`whsec_…` it prints in `STRIPE_WEBHOOK_SECRET`. The Checkout create/expire
calls are the only untested-for-real code path; their shapes follow
Stripe's documented form encoding.

Two PRDs are active at the repo root, phased independently:

- `prd-groundwork-back-office.md`: **Phase 18 next** (BO-8: per-person
  clock in/out: `TimeEntry` model, a crew-view action, and a timesheet CSV that
  sums per person per day). It depends on BO-5's multi-user crews, which are
  done.
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
