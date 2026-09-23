# PRD: Groundwork — Portal Self-Service & Field UX Refinements

**Sample business:** "Evergreen Property Care" (synthetic data only)
**Builder:** Solo, in Claude Code
**Status:** Draft v1.1 — scope discovery from a hands-on owner field-notes session (2026-09-21); PX-1 widened 2026-09-21 from a constrained date-list to an open calendar per owner decision (see inline notes)
**Depends on:** `prd-groundwork-field-service.md` (customer portal, P2 #7, already shipped — this PRD extends it) and `docs/decisions.md`, which outranks both PRDs where they differ
**Learning objective:** confirmation-step UX for a money-bearing self-service action, telling deliberate trade-offs apart from real gaps in the same feedback session, and a dispatcher-review escape hatch for a self-service action that can't always self-approve (an over-capacity date pick)

---

## Problem Statement

The portal and the crew/dispatcher screens it sits beside are functionally solid, but a hands-on session surfaced two customer-facing gaps with real stakes and a handful of smaller rough edges. Customers can only cancel a visit, never reschedule it, and that cancel fires instantly with no confirmation despite a $55–140 line item attached. Crews capture before/after photos on every completed stop, but the customer who paid for the visit never sees them. Separately, the same notes flag friction that is *not* a gap — one-tap complete/skip for a crew in the truck, buttons instead of drag-and-drop — and this document is explicit about which of the two categories each item belongs to, so a fix and a deliberate trade-off don't get conflated later.

## Goals

1. A customer can move a visit to any date they want, not just cancel it or pick from a short pre-filtered list.
2. A customer sees a confirmation step — service, date, price — before a cancel or reschedule commits.
3. A customer can see their own service history, including before/after photos, not just upcoming visits.
4. A crew lead can see tomorrow's route, not only today's.
5. A dispatcher can push all three crews for a rain day in one action instead of three.
6. The crew "stops done" counter only counts visits that actually reached a final state.
7. The deliberate trade-offs the field notes themselves flagged as acceptable (crew one-tap actions, buttons not drag) stay as-is, recorded here so the decision isn't silently re-litigated later.

## Non-Goals

- **Customer-initiated crew reassignment, price change, or service-type change.** Reschedule moves the date only. *(operator review: moving a visit to a different crew or service is a dispatch decision, not a self-service one.)*
- **Silent auto-booking into an already-full crew-day.** The calendar is open (PX-1), but a pick that would push a crew over capacity doesn't book itself — it queues for one-tap dispatcher approval (PX-1's review queue). An open calendar with no capacity backstop at all was considered and rejected: a customer has no visibility into crew load, so nothing stops several customers from all picking the same popular Friday.
- **Removing the crew's one-tap complete/skip.** The field notes explicitly call this "probably fine and even desirable for speed... worth flagging" for the crew side, contrasted with the customer side where "the stakes feel higher." The fix (PX-2, below) is customer-facing only.
- **Drag-and-drop route reordering.** Already a deliberate, documented trade-off (`NEXT.md`: "buttons need no client JS and work on a phone; drag would be the first real client component"). Not reopened here — revisit only if a dispatcher asks for it directly.
- **A new drive-time "fudge factor."** `GROUNDWORK_ROAD_FACTOR` already exists (default 1.3, `docs/decisions.md` Phase 2) and a real OSRM-backed drive-time estimate already shipped (Phase 10). The field note's ask is already solved by configuration the owner wasn't shown. *(PM review: don't rebuild what exists — if anything, this is a demo/onboarding documentation gap; see PX-9.)*
- **Rebalancing or explaining the seeded demo book's over-capacity days.** A seed-data tuning question, not a product requirement. Not addressed here.
- **Multi-property customer login.** Same known, deliberate gap noted in `NEXT.md`; no evidence anyone needs it yet.

## Personas

- **Customer** — now active, not passive: the portal already exists and this PRD extends it.
- **Crew lead (field)** — gains a read-only look-ahead; one-tap actions today are unchanged.
- **Dispatcher/Owner** — gains a bulk rain-day push; otherwise unaffected.

## User Stories (priority order)

1. As a customer, I want to pick a new date for a visit instead of only cancelling it, so a scheduling conflict doesn't turn into a phone call.
2. As a customer, I want to see what I'm cancelling or rescheduling — service, date, price — and confirm before it's final, so a misclick doesn't lose a visit silently.
3. As a customer, I want to see past visits, including the before/after photos my crew took, so I have proof of service without calling the office.
4. As a crew lead, I want to see tomorrow's stops, so I can plan equipment (trailer vs. push mower) the night before.
5. As a dispatcher, I want to push a rain day across every crew at once, so a rained-out morning doesn't mean the same cascade three separate times.
6. As a crew lead, I want the "done" counter to only count visits actually finished, so I don't think I'm further along than I am.

## Requirements

### Must-Have (P0)

**PX-1: Customer self-service reschedule — open calendar**
Replace the portal's single "Cancel this visit" action with "Reschedule" (cancel remains available as a distinct choice). The customer picks **any date from an open calendar** — not a pre-filtered list — within a bounded window (default: today through 60 days out, configurable; matches the existing make-up offer's horizon order of magnitude). *(This is the deliberate choice over a capacity-legal-only date list: more flexible for the customer, at the cost of needing a path for the dates that don't just work — see below.)*
- [x] The visit is skipped via the existing `customerSkip` (`src/visits/status.ts`, reason `customer_request`) the moment the customer confirms a date (PX-2) — unchanged from today
- [x] **If the picked date is capacity-legal**, the new visit books immediately through the same machinery as `bookMakeUp` (`src/visits/makeup.ts`) — no new visit-movement code path, same as the original constrained-list design
- [x] **If the picked date is not capacity-legal**, the visit is NOT silently booked over capacity. It's recorded as a pending `RescheduleRequest` (new, small model: visitId, requestedDate, status `pending`/`approved`/`declined`) and the portal tells the customer their date is submitted and awaiting confirmation, not booked yet
- [x] The dispatcher board gains a lightweight review queue for pending `RescheduleRequest`s — approve (books it, overriding capacity the same way BO-3's job placement already can) or decline with a note (portal shows the decline, customer is directed back to pick again or contact the office)
- [x] The rebooked visit carries the original visit's snapshotted `priceCents`, not the agreement's price today — same rule the existing make-up follows, capacity-legal or reviewed
- [x] The dispatcher board shows a customer-initiated reschedule exactly as it already shows a customer-initiated cancel today (skip reason + make-up booked) once it's actually booked — a pending request shows separately, in the new review queue, until resolved

**PX-2: Confirmation step on customer cancel/reschedule**
Both actions get an intermediate confirm step — service type, date, price, and (for reschedule) the new picked date — with an explicit second action ("Yes, cancel this visit" / "Yes, request [date]") before the mutation runs. For a reschedule, the confirm step also says plainly whether the date will book immediately or needs dispatcher approval (PX-1) — the customer should never be surprised by which one happens.
- [x] No confirmation step added anywhere on the crew side — see Non-Goals; this is customer-facing only
- [x] Structured as a GET-preview / POST-commit pair, the same shape the rain-day cascade already uses (`docs/decisions.md`, Phase 4) — not a client-side confirm dialog, keeping the portal's no-client-JS posture intact

### Nice-to-Have (P1)

**PX-3: Customer service history (past visits + photos)**
The portal gains a "Past visits" view alongside "Upcoming": completed and skipped visits, with the before/after photo thumbnails already captured at completion (`Visit.beforePhoto`/`afterPhoto`).
- [x] Photos are served through a new portal-session-gated route mirroring `app/photos/[name]/route.ts`'s pattern, but checking a `PortalSession` matched to the visit's property instead of a dispatcher role *(security note: this is a real access-control change — do not simply widen the existing dispatcher-only route; a customer must only ever reach photos from their own property's visits)*
- [x] Skipped visits show their reason in plain language, reusing the existing skip-reason copy
- [x] No pagination in v1 — a property's visit volume is small enough that this is future work, not a v1 requirement

**PX-4: Crew multi-day look-ahead**
The crew view gains a read-only "tomorrow" (or next N service days) tab: stops in order, no complete/skip/photo controls.
- [x] Uses the same ordering (`drivenOrder`, `src/routes/route.ts`) the dispatch board would show for that day — no separate ordering logic
- [x] Explicitly read-only *(operator review: keep the state machine's "today only" boundary — decisions.md, Phase 3 — intact; this is a viewer, not a new way to act early)*
- [x] Goes through the same `src/crews/view.ts` projection as today's view — a future day's stops must not carry price either, same as today's

**PX-5: Bulk rain-day push (all crews)**
Extend the existing cascade preview/commit (`src/visits/cascade.ts`, `npm run rain-day`) to preview and commit multiple crews in one pass.
- [x] Each crew's push remains its own transaction — a bulk push is N single-crew commits run together, not one transaction spanning crews, so one crew's stale-preview refusal (`docs/decisions.md`, Phase 4: commit "refuses unless the day still holds exactly the visit ids the preview showed") doesn't roll back another crew's valid commit
- [x] The UI shows a per-crew summary (clean / collision / overflow) before one combined commit action, not three separate screens

### Also Nice-to-Have (P1, trivial)

**PX-6: "Stops done" counter fix**
The crew header's "X of N stops done" currently counts `en_route` toward X. Change it to count only visits in a final state (`completed` + `skipped`) — the same status set the owner report's completion-rate denominator already uses (`docs/decisions.md`, Phase 5: completion rate is "out of what was resolved").
- [x] A filter-predicate fix in the crew view's aggregation, reusing the report's existing "resolved" status list rather than defining a second one *(ponytail: this is one line, not a redesign)*

### Future Considerations / Explicit Keep-As-Is (P2)

- **PX-7 — Crew one-tap complete/skip: keep as-is.** The field notes call this desirable for in-truck speed; not a gap.
- **PX-8 — Route reorder stays buttons, not drag-and-drop.** Already decided (`NEXT.md`); revisit only on a direct dispatcher ask.
- **PX-9 — Documentation fix, not a code change:** add a line in the demo script or admin docs pointing to `GROUNDWORK_ROAD_FACTOR` and the OSRM integration, since the field note's "fudge factor" ask is already solved by configuration the owner simply wasn't shown.

## Success Metrics (evaluated against seeded demo data)

**Leading**
- 100% of portal cancel/reschedule actions in a scripted walkthrough show a confirmation step with the correct price and date before committing, including whether a reschedule will book immediately or needs approval
- A reschedule to a capacity-legal date books immediately; a reschedule to an over-capacity date creates a `RescheduleRequest` and never silently overbooks a crew-day — fixture matrix covering both cases
- The dispatcher review queue's approve action books the pending request through the same path BO-3's capacity override already uses; decline leaves the original visit's skip in place with no booked make-up
- Crew "done" counter matches the completed+skipped count exactly across a fixture day mixing all four statuses
- A bulk rain-day push across 3 crews, with one crew's day already modified after preview, commits the other two and reports the stale one separately — not all-or-nothing

**Lagging (simulated)**
Two scripted walkthroughs: (1) "customer reschedules to an open day" — request link → view upcoming → pick a capacity-legal date → confirm → visit lands on the dispatcher board as a make-up-booked skip immediately; (2) "customer reschedules to a full day" — same flow, but the picked date is over capacity → portal shows "awaiting confirmation" → dispatcher approves from the review queue → visit books.

## Open Questions

- **(Product)** How far out should the open calendar go — 60 days was picked to roughly match the make-up offer's horizon order of magnitude, but confirm that's the right window for a real booking calendar, not just a skip make-up.
- **(Product)** Does a `RescheduleRequest` need its own customer notification when the dispatcher approves/declines it, or does the customer just check back in the portal? Leaning: reuse the existing outbox (BO-7) to notify either way — a customer shouldn't have to poll.
- **(Product)** Does "past visits" need a history cap (e.g., 6 months), or is unbounded fine given a property's low visit volume? Leaning unbounded for v1; revisit if it becomes a real page-weight issue.
- **(Builder)** New portal-photo route vs. parameterizing the existing dispatcher-only one (PX-3) — new route is recommended so the existing route's tests and guarantees aren't disturbed by a second auth path.

## Timeline / Phasing

- **Phase 19:** PX-2 (confirmation step) — smallest, do first; fixes the highest-stakes rough edge
- **Phase 20:** PX-1 (open-calendar reschedule + dispatcher review queue) — builds on PX-2's confirm UI and the existing make-up machinery; the review queue is the net-new surface
- **Phase 21:** PX-6 (counter fix) — trivial; bundle with whichever phase next touches the crew view
- **Phase 22:** PX-3 (service history + photos) — the new auth path is the careful part
- **Phase 23:** PX-4, PX-5 (look-ahead, bulk push) — no dependency on the portal phases

## Build Notes for Claude Code

- CLAUDE.md rules apply unchanged: crews still never see price — PX-4's look-ahead must go through `src/crews/view.ts`'s existing projection, not a raw query. All status changes still go only through `src/visits/status.ts`. Coordinates/clock/cents rules apply to any new code touching visits.
- Reuse is the theme of this whole PRD except PX-1's review queue, which is genuinely new: PX-1 reuses `customerSkip`/`bookMakeUp` for the capacity-legal path, PX-2 reuses the cascade's GET-preview/POST-commit shape, PX-5 reuses `cascade.ts`'s per-crew transaction, PX-6 reuses the report's "resolved" status set, PX-4 reuses `drivenOrder`. `RescheduleRequest`'s approve action should call into the same capacity-override code path BO-3 (`prd-groundwork-back-office.md`) uses for job placement, rather than a second override mechanism.
- New portal routes live under `app/portal/`; the new portal-photo route belongs there too (e.g., `app/portal/photos/[name]/route.ts`), gated by `src/portal/session.ts` — not `src/session.ts`. The dispatcher review queue is a `app/dispatch/` route, gated the normal dispatcher way.
