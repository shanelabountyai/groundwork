# PRD: Groundwork — Back Office & Front Door

**Sample business:** "Evergreen Property Care" (synthetic data only)
**Builder:** Solo, in Claude Code
**Status:** Draft v1.1 — scope discovery from a hands-on owner field-notes session (2026-09-21); scope widened 2026-09-21 per owner decision on billing, one-off jobs, and timesheets (see inline notes)
**Depends on:** `prd-groundwork-field-service.md` (all of P0/P1/P2 shipped — see `docs/design-brief.md`) and `docs/decisions.md`, which outranks both PRDs where they differ
**Learning objectives:** admin/CRUD UI over an already-correct domain model, a real payment-processing integration (Stripe-hosted checkout, webhook-driven status), a standalone `Job` entity alongside `Agreement` as a second pattern-less origin for a `Visit`, and full per-person time tracking independent of visit completion

---

## Problem Statement

An owner spent a real session on the running app — dispatch board, a crew's whole day, the report, the portal — and the scheduling/dispatch engine held up well. But the app has no front door: there is no screen anywhere to add a customer, a property, or a service agreement; no way to drop a one-off job onto a crew's day; and no billing, invoicing, or payment tracking of any kind — the owner report's "Revenue: $8,160.00" is a schedule-value tally, not money collected, and nothing in the app says so. The only way data gets in today is a seed script run from a terminal. An owner who signs three or four new customers a week cannot run the business on that.

## Goals

1. A dispatcher can onboard a new customer/property/agreement, and edit any of it, without a terminal.
2. A dispatcher can drop a one-off job onto a crew's day as its own record — not a recurring agreement faked into looking like one.
3. A customer can be invoiced and pay online; the owner report stops conflating "scheduled value" with money actually collected.
4. Admin-level settings (crews, service types, staff accounts) are editable in-app.
5. A dispatcher can find a customer/property by name or address, and see trends beyond one week at a time.
6. Each crew member can independently clock in/out, so a multi-person crew's payroll data isn't limited to one shared per-stop timestamp.

## Non-Goals

- **A custom card-entry form.** "Full payment processing" (BO-4) means Stripe-hosted Checkout/Payment Links, never raw card fields on our own pages — that boundary is what keeps PCI scope inside Stripe instead of this app. Not a scope cut, a design constraint: same payment capability, none of the card-handling liability.
- **Capacity-checking one-off job placement.** Deliberately joins the exemption `docs/decisions.md` (Phase 2) already grants horizon generation and agreement-level crew reassignment — a dispatcher decision at owner request, made and confirmed 2026-09-21. *(Flag: this means a one-off job, unlike a manual reschedule, can push a crew-day over capacity with no override-and-reason gate. The board's existing overload coloring is the only signal a dispatcher gets.)*
- **A new `Customer` entity.** `docs/decisions.md` (Phase 13) already settled this: the customer *is* the `Property` row's `customerName`/`customerPhone`/`customerEmail` fields. Extend that, don't create a parallel table.
- **Multi-property customer accounts** (one login spanning several properties) — a known, deliberate gap (`NEXT.md`); no evidence anyone needs it. Not addressed here.
- **Role/permission granularity beyond dispatcher/crew** (e.g., an "office admin who can onboard but not touch pricing") — out of scope until a second dispatcher-tier role is actually requested.
- **A general CRM** (marketing lists, sales pipeline, customer notes beyond service history) — the service-history requirement lives in `prd-groundwork-portal-ux.md`; nothing here builds a pipeline.
- **Real geocoding on property entry** — carried forward from the original PRD's Non-Goal; v1's new-property form still takes lat/lng directly. *(operator review: acceptable for a synthetic-data demo; a real deploy needs a geocode-on-save step before this is production-usable — noted, not built.)*
- **GPS/geofence- or biometric-verified clock-in/out (BO-8).** A crew member's time entry is a selection + timestamp from their own logged-in session — not location-verified proof they were on site. That proof already exists separately, in the visit's photo + completion timestamp.

## Personas

- **Dispatcher/Owner** — onboards customers, manages agreements and admin settings, tracks invoices.
- **Crew lead (field)** — unaffected by this PRD except where a one-off job or a new User account puts a new visit or a new login in front of them.
- **Customer** — gains an invoice they can view *and pay* in the portal via a Stripe-hosted checkout link (see `prd-groundwork-portal-ux.md` for the display; the data model and Stripe integration are owned here).

## User Stories (priority order)

1. As a dispatcher, I want to create a new property, its customer contact, and its first agreement, so a new signup doesn't need a script.
2. As a dispatcher, I want to edit a property's access notes, phone, and portal email, and a crew's max stops/hours, so small corrections don't need a database console.
3. As a dispatcher, I want to drop a one-off job onto a specific crew's day as its own record, so a call-in job doesn't need a fake recurring agreement.
4. As a dispatcher, I want to send an invoice with a real payment link, and see it flip to paid the moment the customer pays online, so I stop chasing checks for one-off and seasonal-close-out work.
5. As a dispatcher, I want to add crews, service types, and staff logins from the app, so setup doesn't require touching Prisma directly.
6. As a dispatcher, I want to find a customer or property by name or address, so I'm not scrolling a printed-feeling grid at 400+ properties.
7. As an owner, I want revenue/completion trends over a quarter, and a breakdown by customer or crew lead, not just one week at a time.
8. As a dispatcher, I want to send a one-off message to everyone on a crew's route today ("running late"), without leaving the app.
9. As a dispatcher, I want the report to distinguish scheduled value from actually invoiced/collected revenue, so "Revenue: $8,160" doesn't imply money is in hand.
10. As a crew member, I want to clock in and out on my own, so my hours aren't just whatever the visit timestamps say a truck I share with someone else did.

## Requirements

### Must-Have (P0)

**BO-1: Property & customer CRUD**
Create and edit `Property` (address, lat/lng, `accessNotes`, `customerName`/`customerPhone`/`customerEmail`, `notifyOnEnRoute`).
- [ ] Creating a property does not require an agreement in the same step — a prospect can be entered before they sign
- [ ] Editing `accessNotes`/phone/email takes effect immediately; visits don't snapshot property fields (only `priceCents` is snapshotted), so no regeneration is needed
- [ ] A property with agreements cannot be hard-deleted — remove the agreements first *(operator review: no path that silently drops visit history)*

**BO-2: Agreement CRUD**
Create (property, service type, crew, frequency including `one_time`, `priceCents`, `startDate`) and edit (frequency/price/crew) an agreement; pause/resume already has data support (`paused` boolean) and just needs a UI toggle.
- [ ] Creating an agreement immediately triggers horizon generation for it — doesn't wait for the next scheduled `visits:generate` run, so a new signup shows up on the board today
- [ ] Editing price only affects visits generated after the edit; the UI must not offer to "update existing visits' price" — CLAUDE.md rule 1 (snapshot at generation) applies to the UI's affordances, not just the data layer
- [ ] Pause/resume is one click from the agreement's page

**BO-3: One-off job placement — standalone `Job` entity**
A new `Job` model (property, service type, crew, date, `priceCents`, createdBy) — not an `Agreement`, because one-off work has no pattern to detach from and no recurrence lifecycle to inherit. A `Job` produces exactly one `Visit` row, so it participates in the route builder, crew view, report, and timesheet unchanged: `Visit.agreementId` becomes nullable and a new `Visit.jobId` (also nullable) is added, with a database check constraint that exactly one of the two is set. *(This is the deliberate choice over reusing `Agreement.frequency: one_time` — a real second entity, at the cost of touching the `Visit` foreign-key shape and every query that currently assumes `agreementId` is required.)*
- [ ] A fast-path form (property, service type, price, crew, date) creates the `Job` and its `Visit` in one step, landing directly on the chosen crew-day
- [ ] **Not capacity-checked** — see Non-Goals. A one-off job can push a crew-day over its stated max; the dispatcher only finds out from the board's existing overload coloring, same as horizon generation today.
- [ ] Every place that currently does `visit.agreement.property`/`visit.agreement.priceCents` etc. must branch on which of `agreementId`/`jobId` is set (`src/routes/day.ts`, `src/crews/view.ts`, `src/crews/report.ts`, the timesheet export) — grep-sweep all four before calling this done
- [ ] A `Job`'s `Visit` still goes through the normal state machine (`src/visits/status.ts`) unchanged — completion, skip, and make-up all work identically regardless of origin

**BO-4: Invoicing with real online payment (Stripe)**
New `Invoice` model: one or more `Visit`s (via either `agreementId` or `jobId`), `amountCents` (sum of the visits' snapshotted `priceCents`, or an explicit override), `status` (`draft` → `sent` → `paid` | `payment_failed` | `refunded` | `void`), timestamps per transition, `stripeCheckoutSessionId`/`stripePaymentIntentId`.
- [ ] An invoice can be built from a date range + crew/property filter, or by picking visits manually
- [ ] Sending an invoice creates a Stripe Checkout Session (or Payment Link) for `amountCents`; the link is delivered to the customer through the existing `Notification`/outbox stack (BO-7), not a bespoke send path
- [ ] **No raw card data ever reaches this app's server or database.** Stripe-hosted Checkout only — never a custom card-entry form. This is the PCI-scope boundary (see Non-Goals), not a smaller feature.
- [ ] A Stripe webhook (`checkout.session.completed`, `payment_intent.payment_failed`, refund events), signature-verified against Stripe's signing secret, is the only writer of `paid`/`payment_failed`/`refunded`. A dispatcher can still mark `paid` by hand for out-of-band payment (check/cash/Venmo); online payment is authoritative whenever it happens.
- [ ] Webhook handling is idempotent — Stripe retries deliveries; a replayed `checkout.session.completed` must not double-mark or double-count
- [ ] Stripe secret key and webhook signing secret live in env vars only, `.env.example` documents names not values (house convention)
- [ ] The owner report's "Revenue" line is relabeled ("Scheduled value") or gains a second, clearly distinct line pulled from `Invoice` status ("Invoiced" / "Collected") *(operator review: this is the fix for the report's single most misleading word — don't cut it as a stretch goal)*
- [ ] A customer can view *and pay* their own open invoices in the portal via the Checkout link — display lives in `prd-groundwork-portal-ux.md`; this PRD owns the data model and Stripe integration

**BO-5: Admin — crews, service types, staff accounts**
CRUD for `Crew` (name, `homeLat`/`homeLng`, `maxStops`, `maxMinutes`), `ServiceType` (name, `estimatedMinutes`), and `User` (name, role, `crewId` for a crew role, email or phone).
- [ ] Creating a `User` here is what makes the existing magic-link sign-in (Phase 9) usable for a second dispatcher or a new crew lead without a seed script
- [ ] Changing a `ServiceType`'s `estimatedMinutes` doesn't retroactively change anything already generated — same "agreements are patterns" boundary CLAUDE.md already states for price
- [ ] Deactivating/deleting a `User` revokes their sessions (delete their `Session` rows, or add and check an `active` flag at sign-in — pick one, enforce it)

### Nice-to-Have (P1)

**BO-6: Search**
Customer/property search by name, address, or phone substring, surfaced on the dispatch board and report nav.
- [ ] A plain `ILIKE`/contains query over `Property` — no search index or external search service at this table size *(ponytail: a `WHERE ILIKE` is the correct answer at a few hundred rows; don't reach for Elasticsearch)*

**BO-7: Proactive customer messaging**
A dispatcher sends an ad-hoc message — not tied to a status transition — to one customer or to every customer on a crew's route for a given day, through the existing `Notification`/outbox + provider (`src/notifications/provider.ts`).
- [ ] Reuses the `Notification` table and `outbox:drain` worker; the only new thing is who writes the row (a dispatcher action) and that a row may not be tied to a single visit
- [ ] `Notification.visitId` is currently required (`prisma/schema.prisma`) — make it nullable, or introduce a small subject union; pick whichever is the smaller migration, don't build a second notification pipeline

**BO-8: Full per-person time tracking**
New `TimeEntry` model (`userId`, `crewId`, `date` as `LocalDate`, `clockIn`, `clockOut`), independent of `Visit.startedAt`/`finishedAt` (which stays the per-stop timestamp the route/skip machinery already uses). `Crew.users: User[]` already supports more than one `User` per crew (`prisma/schema.prisma`) — this only needed BO-5's staff-account UI to actually put more than one login on a crew, not a schema change to `Crew`.
- [ ] Each signed-in crew member clocks in/out for themselves from the mobile view — a new action, separate from any visit's start/complete
- [ ] Timesheet CSV (`app/dispatch/timesheet/route.ts`) sums `TimeEntry` per person per day, replacing the current crew-level-only total; still names the crew lead's individual completions per visit too (the "whose name is on this visit" column stays, it's now additive, not the whole feature)
- [ ] `TimeEntry` timestamps come from the injected clock, dates are `LocalDate` strings — same rules as every other timestamp in the app (CLAUDE.md rule 2)
- [ ] No geofence/GPS/biometric verification — see Non-Goals

**BO-9: Extended reporting**
A configurable-range trend view (e.g., quarter) plus per-customer and per-crew-lead breakdowns, extending `src/crews/report.ts`'s one-query-grouped-in-memory pattern over more weeks.
- [ ] No new query-per-week loop — same anti-N+1 discipline the existing report already follows (`docs/decisions.md`, Phase 5)
- [ ] No general BI/export tool — widen this one report's range and grouping, nothing more

### Future Considerations (P2)

- Geocode-on-save for new properties, replacing manual lat/lng entry — still gated behind a real geocoding API, which remains out of scope per the original PRD
- Invoice PDF export — v1's "viewable" is the Stripe Checkout receipt plus the portal's own status page, not a generated PDF
- Partial payments / payment plans on an invoice — v1 is pay-in-full or void
- Capacity-checking `Job` placement, if the deliberate exemption (Non-Goals) turns out to cause real overloads in practice
- An office/admin role distinct from full dispatcher (can onboard, can't edit pricing)

## Success Metrics (evaluated against seeded demo data)

**Leading**
- Every entity this PRD covers (`Property`, `Agreement`, `Job`, `Crew`, `ServiceType`, `User`) has a working create + edit path — a scripted "onboard a customer end to end" walkthrough touches zero terminal commands or scripts
- A `Job`'s `Visit` shows correctly on the route, crew view, report, and timesheet in a fixture that mixes `Agreement`- and `Job`-origin visits on the same crew-day
- A Stripe webhook fixture (using Stripe's test-mode events) drives an `Invoice` from `sent` → `paid`, and a replayed copy of the same event is a no-op
- Every `TimeEntry` in a fixture week sums correctly per person per day on the timesheet export, independent of that person's `Visit.startedAt`/`finishedAt` values

**Lagging (simulated)**
A scripted "onboarding day": add 3 new customers/properties/agreements, place 2 one-off jobs, send 1 invoice and pay it via Stripe test mode, clock 2 crew members in and out — end to end, zero terminal commands.

## Open Questions

- **(Product)** Does "mark paid by hand" need a structured payment-method field (check #, cash) for the dispatcher's own bookkeeping, or is status enough? Leaning: an optional free-text `paidNote`, no structured enum. *(resolved for v1 — revisit if asked for)*
- **(Product)** `Job` placement is explicitly not capacity-checked (owner decision, 2026-09-21) — revisit if the board's overload coloring turns out not to be enough signal in practice.
- **(Builder)** `Notification.visitId` nullability vs. a subject union for ad-hoc messages (BO-7) — decide at implementation time by whichever is the smaller migration.
- **(Builder)** Stripe test mode vs. a fully mocked webhook in CI — `npm test` runs against a local Postgres only (CLAUDE.md), so any Stripe calls in the test suite must be against Stripe's test-mode API or a recorded fixture, never live production Stripe.

## Timeline / Phasing

- **Phase 14:** BO-1, BO-2 (property/agreement CRUD) — the actual front door; build first
- **Phase 15:** BO-5 (crew/service-type/user admin) — unblocks BO-8 (needs real per-person logins) and BO-3 (needs `ServiceType`/`Crew` editable)
- **Phase 16:** BO-3 (`Job` entity + fast-path placement) — the `Visit.agreementId`/`jobId` migration touches every downstream reader, do it once and sweep completely
- **Phase 17:** BO-4 (Stripe invoicing) — depends on BO-1/BO-2 for what to invoice; independent of BO-3/BO-5 otherwise
- **Phase 18:** BO-8 (per-person clock in/out) — depends on BO-5's multi-user crews
- **Phase 19:** BO-6, BO-7, BO-9 (search, messaging, extended reporting) — polish once the front door exists

## Build Notes for Claude Code

- CLAUDE.md rules apply unchanged: money is integer cents (`Invoice.amountCents`), all timestamps come from the injected clock, and every `Visit` still goes through `src/visits/status.ts` for status changes regardless of whether it originated from an `Agreement` or a `Job`.
- `Property` stays the customer record (no `Customer` model) — that part of the reuse-over-invention approach is unchanged. `Job` and Stripe are the two places this PRD deliberately chose a new entity/integration over reuse; both are called out inline above with the reasoning, so a future reader doesn't mistake them for oversights.
- **`Visit.agreementId` becoming nullable is the riskiest single migration in this PRD.** Every existing query that assumes it's always set (`src/routes/day.ts`, `src/crews/view.ts`, `src/crews/report.ts`, the timesheet export, and anywhere `visit.agreement.X` is dereferenced without a null check) needs a sweep, not just a schema change. Do this migration and its sweep as one atomic phase (16), not spread across others.
- New admin/CRUD screens live under `app/dispatch/` (`properties/`, `agreements/`, `jobs/`, `crews/`, `service-types/`, `users/`, `invoices/`), matching the existing dispatcher-gated route convention.
- New domain modules follow the existing `src/<domain>/` shape — likely `src/properties/`, `src/jobs/`, `src/billing/` (Stripe client + webhook handler), `src/timesheets/`.
- After adding fields to `Property`/`Agreement`/`Crew`/`Visit`, grep-sweep every place that already reads that model's full row: Prisma gives no field-level compile error for an unused new column (`docs/design-brief.md`'s own warning).
