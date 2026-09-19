# PRD: Groundwork — Field Service Routes & Crews

**Sample business:** "Evergreen Property Care," a landscaping company running 3 crews (works for cleaning, pest control, pool service)
**Builder:** Solo, in Claude Code
**Status:** Draft v1.0 — written with PM + field-service-operator review baked in (review notes tagged inline)
**Learning objectives:** geo/location data modeling, route ordering, recurring job generation, crew assignment & capacity, mobile-first field views, reschedule cascades

---

## Problem Statement

A field service company's product isn't the mowing — it's showing up. Owners juggle recurring visit schedules, crew assignments, and drive-time-efficient routes on whiteboards and group texts. One rain day scrambles a whole week. Crews in the field need today's stops, property quirks (gate codes, dogs), and a way to mark work done with proof — none of which a whiteboard travels with.

Builder-side, this project targets three feature families no prior project touches: **location data + route ordering**, **recurring-schedule instance generation** (different from Bookable's open-slot model — here the business schedules the customer), and **mobile-first field UI**.

## Goals

1. Recurring service agreements automatically generate the correct visit instances weeks ahead.
2. Each crew gets a daily route ordered to reduce backtracking, editable by the dispatcher.
3. A crew member can run their whole day from a phone: stops, property notes, complete/skip with proof.
4. A weather day can be rescheduled in one action, cascading correctly without breaking future recurrences.
5. **(Builder goal)** Exercise geo data, route heuristics, recurrence engines, and mobile-first views.

## Non-Goals

- **True route optimization (VRP solvers)** — v1 uses nearest-neighbor ordering + manual drag reorder. Optimal routing is an algorithms research project; the learning here is the data model and heuristic, not OR-tools. *(PM review: explicitly cap this — it's the #1 scope-creep risk in this domain.)*
- **Live GPS tracking of crews** — real-time location is privacy + infra work, not scheduling logic. Completion timestamps are the v1 proxy.
- **Payroll/timesheets** — adjacent business function; completion data is designed so it *could* feed one (P2).
- **Customer-facing portal** — v1 is internal ops. Customer notifications are outbox-stubbed per house convention.
- **Real geocoding API** — seed data carries lat/lng directly; a geocoder is config, not logic. Design the address model so one can be added.
- **Turn-by-turn navigation** — deep-link to the phone's map app with the address; never rebuild Maps.

## Personas

- **Dispatcher/Owner** — builds agreements, assigns crews, orders routes, handles rain days.
- **Crew lead (field)** — phone user; runs the day's route, completes/skips stops, logs notes and photos.
- **Customer** — passive in v1; exists as a property + agreement record and a notification recipient.

## User Stories (priority order)

1. As a dispatcher, I want to create a service agreement (property, service type, frequency, price per visit, assigned crew) so that visits generate themselves.
2. As a dispatcher, I want visit instances auto-generated N weeks ahead from each agreement so that the calendar fills without manual entry.
3. As a dispatcher, I want a per-crew daily route ordered by proximity, with drag-to-reorder, so that crews aren't crisscrossing town. *(operator review: "the algorithm suggests, the human decides" — dispatchers will not trust auto-order without an override)*
4. As a crew lead, I want today's route on my phone — stops in order, service details, property notes — so that I never call the office for a gate code.
5. As a crew lead, I want to mark a stop complete with optional photo + note so that we have proof of service for disputes. *(operator review: before/after photos settle "you never came" complaints — this is P0, not nice-to-have)*
6. As a crew lead, I want to skip a stop with a required reason (locked gate, dog loose, customer request) so that skips are visible and reschedulable, not silently lost.
7. As a dispatcher, I want to bulk-reschedule a rain day — push a whole crew's day forward — with the cascade previewed before I commit. *(operator review: the #1 daily pain in this trade; edge: pushed visits colliding with the next day's recurring visits)*
8. As a dispatcher, I want a crew's daily capacity (max stops or estimated hours) enforced so that reschedules can't silently overload a day.
9. As a dispatcher, I want a weekly board (crews × days) showing load per day so that I can balance work at a glance.
10. As an owner, I want completion rates, skip reasons, and revenue per crew per week so that I can see which crews and routes make money.

## Requirements

### Must-Have (P0)

**P0-1: Property & agreement model**
Properties: address, lat/lng, access notes (gate code, pets, "crew must text on arrival"), customer contact. Agreements: property + service type + frequency (weekly / biweekly / every-4-weeks / one-time) + per-visit price (integer cents) + assigned crew + start date.
- [ ] Access notes render prominently on the crew's stop card — not buried in a detail view *(operator review)*
- [ ] Agreements can be paused (customer vacation) and resumed; paused agreements generate no visits

**P0-2: Recurrence engine** *(core learning artifact #1)*
Generates visit instances from agreements on a rolling horizon (default 4 weeks ahead), idempotently.
- [ ] Given a biweekly agreement starting Mon Mar 2, when the horizon job runs, then instances exist for Mar 2, 16, 30 — and re-running the job creates zero duplicates
- [ ] Editing an agreement's frequency regenerates only *future, unstarted* instances; completed/skipped history is untouched
- [ ] A rescheduled instance is detached from its pattern: later regeneration must not resurrect the original date (the classic recurrence bug — regression-test it)
- [ ] Horizon generation runs as a scheduled command (`visits:generate --date=`), same batch-job convention as BoxLoop's billing run

**P0-3: Crew & capacity model**
Crews have members, a home-base lat/lng, and daily capacity (max stops and max estimated minutes; each service type has an estimated duration).
- [ ] Assigning or rescheduling a visit into a day that would exceed capacity requires an explicit dispatcher override, which is logged

**P0-4: Route builder** *(core learning artifact #2)*
Per crew per day: nearest-neighbor ordering from home base using haversine distance, then manual drag-to-reorder that persists.
- [ ] Given 8 stops, when auto-order runs, then total haversine route distance is ≤ the unordered (creation-order) distance in the test fixture set
- [ ] Manual reorder wins: auto-order never runs again on a day a dispatcher has touched, unless explicitly re-requested
- [ ] Route distance/duration estimates display per day (straight-line × configurable road factor; label it as an estimate — never present it as drive time) *(honesty note: no real routing API in v1)*

**P0-5: Mobile crew view** *(core learning artifact #3)*
Phone-first screen: today's ordered stops with status (`pending → en_route → completed | skipped`), access notes, one-tap map deep-link, complete with photo/note, skip with required reason from a fixed list + free text.
- [ ] Usable one-handed at 390px width; test the flow on mobile viewport as an acceptance criterion, not an afterthought
- [ ] Photos stored locally (file upload), attached to the visit record; before/after slots on completion
- [ ] Status transitions validated server-side, same state-machine module pattern as prior projects

**P0-6: Reschedule cascade (rain day)** *(operator review — promoted to P0)*
Dispatcher selects a crew-day → chooses push-forward target (next day / next service day / specific date) → previews the resulting collisions and capacity overflows → commits atomically.
- [ ] Given a pushed day colliding with already-scheduled visits on the target day, when the preview renders, then both sets show with per-visit resolution (keep both / push the pushed one further)
- [ ] Cascade commit is transactional: partial application is impossible
- [ ] Affected customers get an outbox-stubbed notification

**P0-7: Weekly dispatch board**
Crews × days grid, visit counts + estimated hours per cell, color by load vs. capacity; click into any day's route.
- [ ] Reflects reschedules and skips without manual refresh (polling, per Countertop convention)

### Nice-to-Have (P1)

- **P1-1: Skip → auto-offer reschedule** — a skipped visit prompts the dispatcher with the next capacity-legal slot for that crew
- **P1-2: Owner report** — completion rate, skip reasons breakdown, revenue per crew per week (completed visits × per-visit price), route miles per crew
- **P1-3: Customer notification preferences** — "text on the way" toggle per property; `en_route` status fires the outbox stub
- **P1-4: Multi-visit properties** — one property with multiple simultaneous agreements (mow weekly + fertilize monthly), rendered as separate stops that the route builder groups adjacently *(operator review)*

### Future Considerations (P2)

- Real routing API adapter (drive times) behind the estimate interface
- Timesheet export derived from status timestamps
- Customer portal (view schedule, request skip) reusing the tokenized-link pattern
- Route optimization upgrade (2-opt improvement pass over nearest-neighbor) — a fun algorithms extension, kept out of v1 on purpose

## Success Metrics (evaluated against seeded demo data)

**Leading**
- Recurrence correctness: 100% pass on a fixture matrix (biweekly across month boundaries, pause/resume, frequency edit, detached-instance regression)
- Idempotency: 0 duplicate instances across repeated horizon runs
- Route heuristic: auto-order beats creation-order distance on 100% of fixture sets
- Cascade integrity: 0 partial applications across a scripted failure-injection test

**Lagging (simulated)**
- A seeded "rain week" (2 crews, 5 days, 60 visits, one full-day cascade) resolves with zero lost visits — every original instance ends completed, skipped, or rescheduled-and-visible
- Weekly board load totals match hand-tallied fixture values

Measurement method: seed script generating 3 crews, 40 properties with real-ish Tulsa-area coordinates, mixed frequencies, plus a rain-day simulation command.

## Open Questions

- **(Builder)** Photo storage — filesystem or blob column? Filesystem paths in v1; note the tradeoff in WRITEUP.md. *(resolved)*
- **(Builder)** Recurrence: store the rule and generate instances (chosen), or compute on the fly? Generated instances make reschedule-detachment tractable. *(resolved — document why in CLAUDE.md)*
- **(Product)** Do crews see price per visit? Operator review says no — field crews shouldn't see billing. Role-gate it; a two-role permission split here foreshadows the clinic project's full RBAC. *(resolved)*

## Timeline / Phasing

- **Phase 1:** P0-1, P0-2 (properties, agreements, recurrence engine) — TDD the recurrence engine first; it's this project's slot engine
- **Phase 2:** P0-3, P0-4 (crews, capacity, route builder + haversine ordering)
- **Phase 3:** P0-5 (mobile crew view) — build on mobile viewport from the first commit
- **Phase 4:** P0-6, P0-7 (cascade + board), then P1; the rain-week simulation is the capstone demo

## Build Notes for Claude Code

- CLAUDE.md conventions to carry forward: money = integer cents, injected clock, state changes only through the state-machine module — plus new: **coordinates are (lat, lng) in that order everywhere** (the classic silent-swap bug) and **generated visit instances are the source of truth; agreements are patterns**
- Drop WRITEUP.md + the write-up CLAUDE.md block at repo creation
- The cascade preview (P0-6) is the hardest UI in the project — spec its states (clean push / collision / overflow) before building
- Rain-week simulation is the portfolio demo: one command, watch the board reflow
