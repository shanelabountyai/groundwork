# Project Write-Up: Groundwork

> Portfolio write-up template. One per shipped project. Update the "Last synced" line every time the repo changes materially — a stale write-up is worse than none.

**Repo:** [link]
**Live demo:** [link]
**Built with:** Claude Code + Next.js, Prisma, Postgres
**Status:** Shipped [date] · Last synced: [date]

---

## The Business Problem

2–3 sentences. What kind of business, what breaks without software, who feels the pain. Written for a non-technical reader — this is the section a hiring manager or client actually reads.

## What I Built

- Bullet the shipped capabilities in user terms ("customers can book a slot without calling"), not implementation terms ("built a REST endpoint")
- 4–7 bullets max
- Screenshot or short GIF here — one image outperforms every paragraph

## How It's Built

One short paragraph: stack, data model highlights, architecture choices worth naming. Then:

**Key design decisions**
| Decision | Alternative considered | Why I chose it |
|---|---|---|
| e.g., money stored as integer cents | floats | float rounding corrupts billing math |

## Skills Learned / Functions Unlocked

The section this whole portfolio exists for. Be specific:
- **[Feature family]** — what it is, why it was new to me, where it shows up in the code (link to file/module)
- Aim for 3–5 entries; link each to the actual code that proves it

## The Hardest Bug

The credibility section. Tell one real story: what broke, how it manifested, how I found it, what fixed it, what I'd instrument next time. Polished write-ups without a failure story read as AI-generated.

## What I'd Do Differently

2–3 honest items. Scope cuts, architecture regrets, things v2 would change.

## By the Numbers

- Lines of code / test count / coverage %
- Build time (calendar days, sessions)
- Anything measurable from the seed data or demo

---

*Part of my Claude Code build log: [link to build-log page]*

---

## Build log

### Recurrence engine (Phase 1) — 2026-09-19

**Problem:** agreements (weekly / biweekly / every 4 weeks / one-time) must
fill the calendar four weeks ahead, re-running must never duplicate, and a
rescheduled visit must never reappear on the date it left.

**Design:** a pure planner (`src/visits/recurrence.ts`) diffs the pattern
against existing visits keyed on `occurrenceDate`, the slot the pattern
produced, which a reschedule never changes. A unique index on
(agreement, occurrenceDate) enforces the same thing in the database, so the
guard is doubled: mutating the planner to key on `date` fails the unit test,
while the integration test still passes on the index alone.

**Deliberately not:** computed-on-the-fly occurrences (a reschedule needs a
row to detach), or cancelling withdrawn future visits (deleted, since they
have no history).

### Route builder (Phase 2) — 2026-09-19

**Problem:** each crew-day needs a sensible stop order without backtracking,
but dispatchers won't trust an algorithm they can't override, and an
override that silently gets re-optimized is worse than none.

**Design:** a pure module (`src/routes/route.ts`) does haversine distance and
greedy nearest-neighbor from the crew's yard; tested on three 8-stop Tulsa
fixtures that it never loses to creation order. Persistence
(`src/routes/day.ts`) stores nothing for an untouched day, which is re-ordered
on every read, and a `routePosition` per visit once a dispatcher drags. The
presence of any position *is* the "touched" flag, so there is no second
source of truth to drift; moving a visit clears its position so it can't
mark its new day as touched. Distance is shown as an estimate (straight-line
× road factor), never as drive time.

**Deliberately not:** a VRP solver or 2-opt pass (P2), a routing API, or
persisting the auto order. Capacity overrides (`src/crews/capacity.ts`) are
checked after the move in a transaction holding the crew row lock, so a
refused move rolls back and two concurrent moves can't both squeeze in.

### Mobile crew view (Phase 3) — 2026-09-19

**Problem:** a crew lead on a phone, often one-handed and on a weak signal,
has to run the day's route: see the next stop and its gate code, open maps,
and close each stop with proof (before/after photos) or a reason it was
skipped. The crew must never see what the customer pays.

**Design:** every status change goes through one state machine
(`src/visits/status.ts`): pending → en route → completed, or skipped from
either open state. The server checks the crew owns the stop and that it's
today's, and each update is conditional on the status it just read, so a
double tap or two phones can't both win. The database backs it up: a skip
must carry a reason, and timestamps must match the status. Price is kept off
the phone by construction: the crew page is built from an explicit field list
(`src/crews/view.ts`), and a test fails if "price" or the amount appears in
what it sends. Photos are checked by their bytes, not their file name or
claimed type, and named by the server. The page is server-rendered forms with
native `<details>`, so it works with no client JavaScript, and each post
redirects so a reload never resubmits. Playwright drives it on a production
build at 390px.

**Deliberately not:** sign-in (crews pick themselves until the dispatcher UI
brings a second role), undoing a completed or skipped stop (a dispatcher
correction), displaying photos (stored now, shown when the dispatcher view
exists), or cloud photo storage (local disk per the PRD, which does not
survive a serverless deploy).

### Reschedule cascade and the dispatch board (Phase 4) — 2026-09-20

**Problem:** it rains on Tuesday. A dispatcher has to move a whole crew-day
forward in one action, see what that does before committing — stops that land
where the same property is already booked, days that end over capacity — and
have it be all or nothing. A half-applied push is worse than no push: half the
customers are told the wrong thing and the board no longer matches the trucks.

**Design:** one planner (`src/visits/cascade.ts`) that preview and commit both
run, over the same reads. Preview is a pure GET — every input (target day,
per-visit keep-or-push-further) lives in the URL, so it can be re-run, shared,
or backed out of, and only the commit is a POST. The preview names five states:
*empty*, *clean*, *collision*, *overflow*, *stale*. Commit opens one
transaction, locks the crew row (the same lock single-visit reschedules take,
so loads measured inside it stay true), then checks that the day still holds
exactly the visits the dispatcher was shown — if a crew started a stop in
between, nothing moves and the preview comes back. Each move is a conditional
update, capacity is measured *after* the moves, and an overflow either throws
or logs a `CapacityOverride` per landed visit. Customer notices are written as
outbox rows in the same transaction, so a notice exists only if the move did.
Moved visits detach from their pattern and drop their route position, which is
what keeps the next generation run from resurrecting the rained-out date.

The board (`src/crews/board.ts`) is crews × seven days, coloured by load
against capacity, counting exactly what the capacity check counts — the two
cannot disagree because they share `overCapacity`. It polls itself so a skip
from a phone shows up without a refresh.

**Proving it:** the no-partial-application claim is tested by injecting a real
database fault — a trigger that raises on the *last* visit update, and another
on the outbox insert — then asserting a byte-for-byte snapshot of every visit
is unchanged and no notice was queued. Mocking the application code would only
have proved the mock ran.

**Deliberately not:** real authentication (a role switcher in
`src/session.ts`; authorization is real, identity is not), pushing en-route or
finished stops (the crew skips those from the phone), a collision check *among*
the pushed stops themselves (they shared a day already), and capacity checks on
horizon generation or an agreement-level crew change — neither is a dispatcher
placing a visit, and the board now colours the overload where it shows up.

### Owner report (Phase 5, P1-2) — 2026-09-20

**Problem:** the owner does not dispatch. They want one screen a week that
answers four questions — did the work get done, why not where it didn't, what
did it earn, and how far did we drive to earn it — and none of those numbers
may disagree with what the dispatcher was looking at the same morning.

**Design:** one query over the week, grouped in memory, the same shape
`weekBoard` uses, with money added (`src/crews/report.ts`). Three definitions
carry the whole design, so they are stated in the module doc *and* on the page
rather than left for a reader to infer:

- **Completion is out of what was resolved** — completed ÷ (completed +
  skipped). The obvious denominator, everything scheduled, makes Monday
  morning read as 0% for a week that simply has not happened yet. Open visits
  get their own column instead, so nothing is hidden by the choice.
- **Revenue is completed visits at the price the visit snapshotted**, never the
  agreement's price today. The test raises every agreement to $999 after the
  fact and asserts the week's revenue does not move — the project's first hard
  rule, made into something that can fail.
- **Miles include skipped stops.** The truck drove the route that was
  dispatched; a locked gate does not refund the drive.

The interesting part was mileage. "Miles per crew" is only right if it measures
the order actually driven, which is the rule the route page already owned:
the dispatcher's order if anyone set one, nearest-neighbor otherwise. That
rule got lifted into `drivenOrder` and both call it — and the test asserts the
report's miles equal `routeFor`'s, because a number with two implementations
is a number that will eventually have two values.

**What it deliberately does not do:** no charts, no date range beyond a week,
no export, no per-service-type breakdown, and no drive-time API — the miles
are the same straight-line estimate as everywhere else, labelled as one on
both screens. The seed grew four weeks of history to make the page worth
looking at; `HISTORY_DAYS = 28` is a whole number of weekly, biweekly and
every-4-week periods, so backdating the book left the current week identical,
which is checkable: miles per crew were the same before and after.

### Make-up offer (Phase 5, P1-1) — 2026-09-20

**Problem:** a locked gate is not a cancellation. The stop still owes service,
and the dispatcher's next question is always the same one — *when can that crew
go back?* Answering it by hand means reading five days of a board and doing the
capacity arithmetic in your head, which is exactly the arithmetic the app
already does twice.

**Design:** `offerSlot` (`src/visits/makeup.ts`) walks forward service days from
the skip and returns the first one where this visit's minutes still fit under
the crew's stop and hour limits, using the same `overCapacity` the dispatch
board colours cells with and the rain day refuses pushes with. The skipped stop
on the day page then carries one button: *Book make-up Thu, Mar 12*.

The design question worth the time was what "booking" writes. Moving the
skipped row forward is the shorter diff, and it is a lie — the crew went, the
gate was locked, and the skip-reason breakdown in the owner report is the
evidence that justifies a second trip. So the skip stays exactly as it is and
the make-up is a new row. That needs an occurrence slot of its own, because the
unique index on `(agreement, occurrence)` is what makes generation idempotent,
and it must be a slot the pattern will never ask for. `occurrenceDate + 1` is
that slot for free: the shortest recurrence step in the trade is a week, so a
one-day offset is unreachable by construction rather than by a flag someone has
to remember. Three things then fall out at no cost — the horizon run cannot
refill the skipped slot, it cannot withdraw the make-up (it is `detached` from
birth), and booking the same make-up twice is a unique-index violation instead
of a race to lose.

The offer is a suggestion, never a promise. Between rendering the button and
the click, the target day can fill up, so `bookMakeUp` locks the crew row
`FOR UPDATE`, inserts, then measures — the shape `rescheduleVisit` established
— and rolls the insert back if the day is now over. The money needed no special
care, which is the point of snapshotting: the skipped visit never completes so
it earns nothing, and the make-up carries the price the skipped visit recorded.

**What it deliberately does not do:** no override. The rain day has one because
a dispatcher pushing a whole rained-out day sometimes has no choice; a single
make-up that does not fit has an answer already — a later day, or a manual
move. Nothing fits inside two weeks and the page says so rather than offering
an overload. There is no auto-booking either: the crew skips, the dispatcher
decides. And the customer's notice is the same outbox stub as everywhere else,
written in the booking transaction and never sent.

### Notification preferences (Phase 5, P1-3) — 2026-09-20

**Problem:** every property got an en-route text whether the customer wanted
one or not, and there was no field to say otherwise.

**Design:** one `Property.notifyOnEnRoute` boolean, default `true`. The gate
sits in `transition` (`src/visits/status.ts`) itself, not in a caller, because
it is the one place every visit's status change already passes through — the
same reasoning that put the racing-tap guard there. The `en_route` branch now
runs inside a transaction: the status update and the outbox write commit
together or not at all, matching the cascade and make-up outbox writes
elsewhere. The write itself is unchanged in shape, just conditional.

**What it deliberately does not do:** no sender, no per-channel preference
(email vs. sms), no UI — there is no property edit screen yet to put a
checkbox on. The outbox stays undrained; a worker and a provider are P2's
seam, not this one's.

### One-off jobs: a second origin for a visit (Phase 16, BO-3) — 2026-09-22

**Problem:** a call-in job had nowhere to live except a fake `one_time`
agreement. The back-office PRD chose a real `Job` entity instead, at the price
of `Visit.agreementId` going nullable, and flagged it as the riskiest migration
in the project: every reader that walked `visit.agreement.property` would need
to branch on which origin a visit has. The PRD named four such readers. The
typechecker found fifteen files: board, capacity, rain-day cascade, make-up,
the state machine, the portal, both dispatch day pages, and the rain-day
script, on top of the four.

**Design:** make branching unnecessary instead of doing it fifteen times. A
visit's property and service type never change after it is created, because
the agreement edit form cannot touch them. So they are copied onto `Visit` at
its two creation sites (horizon generation and make-up booking, plus the new
`placeJob`), and every reader goes from `v.agreement.property` to
`v.property`. That was a mechanical rewrite. Two new invariants carry the
weight, and the database enforces both. `num_nonnulls(agreementId, jobId) = 1`
means a visit has exactly one origin. A trigger refuses any visit whose copied
property or service type disagrees with its origin, and refuses any edit to an
agreement's or job's property or service type. So the copy is safe because it
cannot drift, not because every writer remembers to keep it in sync.

The trap the typechecker cannot catch is a filter. `where: { agreement: {
propertyId } }` still compiles against a nullable relation and silently drops
every job visit. The portal's schedule query was exactly that. It became
`where: { propertyId }`, and a test checks that a job visit shows up in the
portal.

Make-up needed one idea: a make-up keeps its skipped visit's origin. A
second unique index, `(jobId, occurrenceDate)`, gives a job's make-up the same
slot trick an agreement's gets, where `occurrence + 1` is unreachable and
booking twice violates the index. The lookup compares both origin columns,
null against null, so exactly one of them matters.

`Job` stores neither a crew nor a date. The visit carries those, and it is the
source of truth (rule 5), so there is nothing on the job to go stale when the
visit is rescheduled.

**What it deliberately does not do:** no capacity check. That was the owner's
decision, and the board's overload colouring is the only signal, the same as
for horizon generation. A job can't be placed in the past, since a crew can
only update today's stops. It also can't be deleted, the same as an agreement,
so a property with a job keeps its history.

### Invoicing with Stripe (Phase 17, BO-4) — 2026-09-22

**Problem:** the owner report said "Revenue: $8,160.00", but that figure was
the scheduled value of completed work, not money anyone had paid. There was no
way to bill a customer, and no way to see that a bill had been paid.

**Design:** an invoice is one customer's completed visits, and its amount is
fixed from their snapshotted prices when it is built. Sending it opens a
Stripe-hosted Checkout Session and queues the link through the existing
outbox. Card data never touches this app. The only writer of
paid/failed/refunded is a webhook, and it accepts nothing until an HMAC
signature over the raw body checks out, inside a 5-minute window read from
the injected clock.

Most of the design is about stopping two things: double counting and double
charging. Stripe retries deliveries, so each event id is recorded in the same
transaction as the change it makes, and a replay hits the primary key and does
nothing. Stripe also delivers events out of order, so every status change is a
conditional update naming the statuses it may come from, and a late
"payment failed" cannot demote a paid invoice. The harder case was a
dispatcher voiding an invoice, or marking it paid by check, while the
customer's link still worked. Both paths now expire the Checkout Session
first, and refuse if Stripe says it already completed. The row stores the one
session that may still be open, and a new one is opened only after Stripe (not
our clock) says the old one expired. So there is never a second live link to
pay.

**What it deliberately does not do:** there is no SDK (three REST calls and one
HMAC), no amount override, no partial refunds or partial payments, and no fake
checkout for local dev. Without a test-mode key, send refuses with a clear
message. The report's "Invoiced" and "Collected" lines are weekly totals, not
per crew, because an invoice belongs to a customer rather than to a crew.

### Per-person time tracking (Phase 18, BO-8) — 2026-09-22

**Problem:** the timesheet summed visit start/finish times per crew. Two people
sharing a truck got one number between them, and time driving between stops
counted for nobody.

**Design:** each person clocks themselves in and out from the phone view, and
the session, not the form, says who. The database allows one open shift per
person, so a double tap cannot open two. The export sums each person's closed
shifts per day in milliseconds and rounds once. A shift that is still open is
flagged rather than guessed at. Deleting a user, which is how access is
revoked, keeps their hours under their name.

**What it deliberately does not do:** no GPS, geofence or photo proof of
presence (the visit photos already cover "was on site"), no dispatcher edits
to entries, and no splitting a shift that crosses midnight. It counts to the
day it began.
