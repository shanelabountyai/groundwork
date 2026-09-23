# Next

**Back-office Phase 19 (BO-6 search, BO-7 crew-day messaging, BO-9 quarter
report) is done**, 2026-09-23 — the last back-office phase, so
`prd-groundwork-back-office.md` is complete. See `docs/decisions.md` → Phase 19
and WRITEUP.md. `npm test` 134/134, e2e 15/15 on a production build.

Phase 17 (Stripe) is still **not exercised against real Stripe test mode** —
no keys in any env file. To demo: `STRIPE_SECRET_KEY=sk_test_…` in `.env`,
`stripe listen --forward-to localhost:3900/stripe/webhook`, and the `whsec_…`
it prints into `STRIPE_WEBHOOK_SECRET`.

Remaining work is the other PRD, `prd-groundwork-portal-ux.md`. **PX-2's cancel
half is done** (2026-09-23; `npm test` 134/134, e2e 16/16). Its reschedule half
ships with PX-1 — the next item: open-calendar reschedule plus the dispatcher
`RescheduleRequest` review queue. (Phase numbers collide with back-office's;
track by name.) Then PX-6, PX-3, PX-4/PX-5.

Closure deliverables for the project as a whole are still owed before
"good to clear" on the project: `docs/DEMO.md`, the exec-brief artifact, and
the LinkedIn drafts.

Known gaps carried forward, none blocking:

- **Timesheet has no "who completed this visit" column** — visits record the
  crew only (decisions.md, Phase 18). The quarter view's "per crew lead" is
  per crew for the same reason (Phase 19).
- **Search phone match is a raw substring**, not digits-only (Phase 19).
- **`next dev` appends a `nextjs-agent-rules` block to `CLAUDE.md`.** Decided
  2026-09-20: committed, so the tree stays clean when the tool re-adds it.
  Leave it in place.
- **Route reorder is ↑/↓ buttons, not drag** (P0-4 says drag).
- **Nothing calls `npm run outbox:drain` yet** — no cron configured; wire it up
  when a deploy target exists. Ad-hoc messages sit in the outbox until then.
- **Horizon generation and agreement crew changes still skip the capacity
  check** (decisions.md, Phase 2 and 4); BO-3 job placement joins the exemption.
- **The weekly owner report has no export**; the quarter view is the only
  range (decisions.md, Phase 5, 19).
- **The make-up offer has no override and looks 14 days ahead** (Phase 5, P1-1).
- **The portal shows one property per customer** (Phase 13).
- **Property phone/email aren't stored normalized** (Phase 13, `ponytail:` note
  in `src/portal/session.ts`).
- **A property can't be hard-deleted once it has any agreement** (Phase 14).
