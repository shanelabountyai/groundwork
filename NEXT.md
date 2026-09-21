# Next

**Back-office Phase 14 (BO-1, BO-2: property & agreement CRUD) is done**,
2026-09-21: `app/dispatch/properties/` (list, new, edit + delete-guard) and
`app/dispatch/agreements/` (new, edit + pause/resume), backed by a new
`createAgreement` in `src/visits/generate.ts` that generates a new
agreement's visits into the horizon immediately, and `parseCents` in
`src/money.ts`. See `docs/decisions.md` → Phase 14 for the design calls
(edit-form scope, delete guard, route/file conventions). `npm test` 103/103.
Manually walked create-property → create-agreement (visits generated
immediately) → edit price → pause → delete-blocked in a real browser against
dev data via a magic-link sign-in; screenshots confirmed styling matches the
rest of the app. Test property/agreement cleaned out of the dev DB after.

**This was Phase 14 of `prd-groundwork-back-office.md`** (now committed at
the repo root, alongside `prd-groundwork-portal-ux.md` — both drafted
2026-09-21 from an owner field-notes session, both untracked until this
session). Two PRDs are now active, phased independently:

- `prd-groundwork-back-office.md`: Phase 15 next (BO-5 — crew / service-type
  / user admin CRUD). It unblocks BO-3 (`Job` entity needs editable
  `ServiceType`/`Crew`) and BO-8 (per-person clock in/out needs real
  multi-user crew logins).
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
