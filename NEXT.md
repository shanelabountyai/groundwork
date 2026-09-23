# Next

**Back-office Phase 19 (BO-6 search, BO-7 crew-day messaging, BO-9 quarter
report) is done**, 2026-09-23 — the last back-office phase, so
`prd-groundwork-back-office.md` is complete. See `docs/decisions.md` → Phase 19
and WRITEUP.md. `npm test` 134/134, e2e 15/15 on a production build.

Phase 17 (Stripe) **was exercised against real Stripe test mode 2026-09-23**: send → Checkout (4242 card) → `checkout.session.completed` webhook → invoice `paid` (one $55.00 invoice left paid in `groundwork_dev`). Keys are in `.env` (restricted `rk_test_`, gitignored); `stripe listen --print-secret` regenerates the `whsec_`. Checkout needs ZIP filled and the Card radio forced in headless. To demo: `STRIPE_SECRET_KEY=sk_test_…` in `.env`,
`stripe listen --forward-to localhost:3900/stripe/webhook`, and the `whsec_…`
it prints into `STRIPE_WEBHOOK_SECRET`.

Remaining work is the other PRD, `prd-groundwork-portal-ux.md`. **PX-1 and
PX-2 are done** (2026-09-23, "Portal-UX Phase 20"; `npm test` 139/139, e2e
18/18): open-calendar reschedule, the `RescheduleRequest` queue at
`/dispatch/reschedules`. **PX-6 needed no change** (counter already excludes `en_route`; decisions.md).
**PX-3 done** (2026-09-23; `npm test` 141/141, portal e2e 4/4: history + `/portal/photos/[name]`, decisions.md). **PX-4 done** (2026-09-23; `npm test` 141/141, crew e2e 6/6: `/crew/[crewId]/ahead`, decisions.md). **PX-5 done** (2026-09-23; `npm test` 142/142, dispatch e2e 8/8: `/dispatch/rain/[date]`, decisions.md) — **Portal-UX is complete.** (Phase numbers collide with back-office's;
track by name.)

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
- **Declined reschedule isn't retryable in the portal** and sends no notification (decisions.md, Portal-UX Phase 20).
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
