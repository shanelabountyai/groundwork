# Decisions

Dated. Outranks the PRD where they differ.

## 2026-09-19 — Kickoff

- **Stack:** Next 16 + Prisma 7 (pg adapter) + local Postgres + Vitest, matching clearpath. Port 3900.
- **Reuse (Session 0):** `reuse-scan.py` found no real matches (only storage business is indexed). Lifted from clearpath instead: `src/clock.ts` verbatim, `db.ts` and the test harness pattern, and the recurrence planner (`scheduling/recurrence.ts`) adapted. Anchored on the start date, not a weekday, with four frequencies. Groundwork owns its copy; the two diverge freely.
- **Recurrence stored as rule + generated rows** (PRD open question, resolved): generated rows make reschedule-detachment tractable.
- **Horizon is inclusive, 28 days:** the PRD's own example (biweekly from Mar 2 reaches Mar 30) requires it.
- **Obsolete future visits are deleted, not cancelled:** a pending, attached, future visit has no history, and deleting it frees its slot if the pattern returns to it.
- **Detached visits survive pattern edits:** a person placed them.
- **Price snapshotted on each visit** (not in PRD): keeps revenue per week (P1-2) honest across price changes.
- **Model:** Opus for Phase 1 — the recurrence engine is correctness-critical.

## 2026-09-19 — Phase 2 (capacity + route builder)

- **"Touched" is derived, not a flag:** a day is manual iff any of its visits has a `routePosition`. No `RouteDay` table. The cost: every path that moves a visit to another crew-day must null its position (`rescheduleVisit`, crew change in `editAgreement`). P0-6's cascade must do the same.
- **Untouched days are ordered on read, not persisted:** visits that arrive later slot into the nearest-neighbor order for free. "Re-request auto-order" = clear the day's positions.
- **On a manual day, late arrivals sort last** (by creation). The dispatcher places them; auto-order stays out.
- **Route is a round trip** (home → stops → home), in miles. Estimate = straight-line × `GROUNDWORK_ROAD_FACTOR` (default 1.3) at 25 mph; always labelled an estimate.
- **Capacity counts every non-skipped visit** (pending, en route, completed) against max stops *and* max minutes. Checked after the move inside one transaction with the crew row locked `FOR UPDATE`, so concurrent moves serialize. An override needs a non-blank reason and author and is logged in `CapacityOverride` with the load it caused.
- **Not capacity-checked (deliberately, for now):** horizon generation and an agreement-level crew reassignment. Neither is a dispatcher placing one visit on one day; the weekly board (P0-7) colours those overloads. Revisit with the cascade.
- **Crew members skipped** until the crew view needs sign-in (Phase 3).
- **Seed** (`npm run db:seed [-- --reset]`): 3 regional crews, 40 properties, deterministic PRNG, refuses production and non-local databases.

## 2026-09-19 — Phase 3 (mobile crew view)

- **State machine** (`src/visits/status.ts`): pending → en_route → completed, and a skip from pending *or* en_route (a customer can cancel before the crew leaves). Completed and skipped are final for a crew; undoing one is a dispatcher correction, not built yet. No complete-from-pending: the PRD's arrow goes through en_route, and `startedAt` feeds the P2 timesheet.
- **Server-side guards:** a crew can act only on its own visits and only on today's (injected clock). Updates are conditional on the status just read, so of two racing taps exactly one wins. The database also checks outcome shape: a skip has a reason and only a skip does; `startedAt`/`finishedAt` follow status.
- **Skip reasons are an enum** (locked gate, dog loose, customer request, weather, other); free text is optional except for "other".
- **Price gate is a projection, not a role check** (`src/crews/view.ts`): the crew view is built from explicitly listed fields, so price never reaches the page (it is read from the database by `routeFor`, then dropped). A test asserts no "price" key and no price value on the wire.
- **No sign-in yet.** Crews pick themselves at `/crew`. The per-visit crew check is correct but, without auth, not a security boundary. Sign-in lands with the dispatcher UI, when two roles exist to split. Synthetic data only.
- **Photos on local disk** under `uploads/` (gitignored), type sniffed from the bytes, file named by the server, 10 MB cap. Will not survive a serverless deploy; blob storage replaces `savePhoto` when the app is hosted. Photos are stored, not yet displayed (the dispatcher view needs them first).
- **No client JS for the flow:** server actions + native `<details>` and `required` radios. It works on a bad connection with a half-loaded page, and each post redirects so a reload never resubmits.
- **e2e:** Playwright against `next build && next start`, 390×844 touch viewport, one worker, global setup reseeds `groundwork_test` and refuses any other database. Runs in CI after vitest.

## 2026-09-20 — Phase 4 (rain-day cascade + dispatch board)

- **Preview is a GET, commit is a POST.** All preview inputs (target, per-visit
  resolution) are query parameters, so the preview re-runs from the URL and has
  no state of its own. Two forms on the page: a plain GET submit re-previews, a
  server action commits.
- **Five preview states, named in the module doc:** empty / clean / collision /
  overflow / stale. "Collision" is *the same property* already booked on the
  landing day, not merely a busy day — a busy day is overflow, which is a
  capacity question with a different answer.
- **Only pending visits move.** En-route, completed and skipped stay; a crew
  that already started a stop skips it from the phone with reason `weather`.
- **"Push further" means the next service day after the target** (Mon–Fri,
  fixed for now), one hop only. Arbitrary per-visit dates are a scheduling UI,
  not a rain day.
- **Commit re-reads and re-plans inside the transaction**, and refuses unless
  the day still holds exactly the visit ids the preview showed (`expect`).
  Capacity is measured after the moves, as `rescheduleVisit` does, with the
  crew row locked `FOR UPDATE` so the two paths serialize against each other.
- **Overflow logs one `CapacityOverride` per landed visit**, same shape as a
  single-visit override, so the audit trail has one format.
- **Notifications are a transactional outbox** (`Notification`, written in the
  cascade's transaction, `sentAt` null forever in v1). A notice cannot exist
  for a move that rolled back.
- **Failure injection is a database trigger, not a mock:** the test raises from
  Postgres on the last visit update, and separately on the outbox insert, then
  asserts an unchanged snapshot. Mocking would have tested the mock.
- **The Phase 2 gap stays open, deliberately:** horizon generation and an
  agreement crew change are still not capacity-checked. Neither is a dispatcher
  placing a visit; the board colours the result, which is the visibility the
  gap was waiting for.
- **Sign-in is a dev role switcher** (`src/session.ts`, cookie only, no
  password), the clearpath seam. The split it enforces is real: dispatcher
  pages and the photo route check the role, crew actions take the crew id from
  the session instead of the form. Real auth replaces one file.
- **Photos are served by a route that only a dispatcher can call**, with the
  file name matched against exactly what `savePhoto` writes.
- **Board polls every 10s** with `router.refresh()` (no cursor; the query is
  three joins over a week). Countertop's cursor endpoint is the upgrade if it
  ever costs anything.
- **Seed grows to 120 properties** so a crew-day carries ~6 of 8 stops: pushing
  one day onto the next has to overflow, or the demo shows nothing.
- **`npm run rain-day -- --crew=Midtown [--commit]`** is the capstone demo:
  preview printed, commit optional, and it reports visit counts before/after so
  "zero lost visits" is checked, not asserted.

## 2026-09-20 — Phase 5, P1-2 (owner report)

- **Completion rate is out of what was *resolved*** (completed + skipped), not
  out of everything scheduled. The other denominator makes a week that has not
  happened yet read as 0% — a number that looks like failure and means
  "Tuesday". Open visits are reported beside the rate instead, so the reader
  can see what is still out.
- **Revenue is completed visits at the visit's snapshotted `priceCents`.** The
  test raises every agreement's price after the fact and asserts the week's
  revenue does not move; that is the hard rule made checkable.
- **Miles include skipped stops.** The crew drove the route that was
  dispatched, and a locked gate does not refund the drive. Same straight-line
  estimate the route page shows, labelled as an estimate on both.
- **One ordering function, two callers** (`drivenOrder` in `routes/route.ts`).
  The report needed the *driven* order to get miles right, which is the rule
  the route page already owned: manual if any visit carries a position,
  nearest-neighbor otherwise. Extracted rather than copied, and the test
  asserts the report's miles equal `routeFor`'s — the one number with two
  implementations.
- **One query for the week, grouped in memory**, like `weekBoard`. Calling
  `routeFor` per crew-day would have been 42 queries for a three-crew week.
- **The seed now carries four weeks of history**, or the report has nothing to
  report. `HISTORY_DAYS = 28` is chosen, not rounded to: it is a whole number
  of weekly, biweekly *and* every-4-week periods, so backdating the recurring
  agreements leaves the current week's book byte-for-byte what it was (miles
  per crew were identical before and after). One-time jobs stay on this week —
  moved back they would just vanish from it.
- **The backfill writes outcome rows directly**, and only for visits before
  today. Directly because the state machine moves *today's* visits by design;
  before-today so every future visit stays pending and the rain-day demo is
  untouched. The database's shape checks apply to a fixture exactly as they do
  to a crew, which is what makes the direct write safe.

## 2026-09-20 — Phase 5, P1-1 (skip → make-up offer)

- **A make-up is a new visit; the skip stays.** Un-skipping the row would have
  been the shorter diff and it lies: the crew *did* go, the gate *was* locked,
  and the report's skip-reason breakdown is the reason anyone funds a second
  trip. The skipped row keeps its reason and `finishedAt`; the make-up is a
  fresh pending row. Money stays right for free — a skipped visit never
  completes, so it earns nothing, and the make-up carries the skipped visit's
  snapshotted `priceCents`, not the agreement's price today.
- **The make-up's occurrence slot is the skipped one plus a day.** It needs a
  slot of its own (`@@unique([agreementId, occurrenceDate])`) that the pattern
  will never ask for, and no frequency steps by a day — the shortest is a
  week — so `occurrenceDate + 1` is unreachable by construction rather than by
  a flag. Two consequences fall out at no cost: the horizon run neither
  withdraws the make-up (it is `detached`) nor refills the slot it took, and
  booking the same make-up twice is a unique-index violation, not a race to
  lose. A make-up of a make-up lands on +2, and so on.
- **The offer is capacity, not a calendar.** `offerSlot` walks service days and
  returns the first where *this visit's* minutes still fit under the crew's
  limits — the same `overCapacity` the board and the rain day use, so the three
  can never disagree. No offer inside two weeks shows "no open slot" and hands
  the dispatcher the manual move; it never offers an overload and never picks
  an override on their behalf.
- **The offer is re-checked at booking, never trusted.** Between rendering the
  button and the click, the day can fill. `bookMakeUp` locks the crew row
  `FOR UPDATE`, inserts, then measures — the `rescheduleVisit` shape — and a
  day that filled throws `CapacityExceeded` with the insert rolled back.
- **No override path on the offer.** The rain day has one because a dispatcher
  pushing a whole day sometimes must. A single make-up that does not fit has an
  answer already: take a later day, or move it by hand.
- **One query for the offer, one per skipped stop on the page.** Marked
  `ponytail:`; a crew-day with more than a couple of skips is not a thing yet.

## 2026-09-20 — Phase 5, P1-4 (multi-visit properties)

- **No code change.** Two agreements on one property already produce two
  separate `Visit` rows, and `routeFor` (`src/routes/day.ts`) builds one stop
  per visit from `agreement.property.lat/lng` — so the two stops already
  carry identical coordinates. `nearestNeighbor`'s existing tie-break
  (`src/routes/route.ts`) seats them adjacent for free: once either is
  visited, the other is a zero-distance match and wins every subsequent
  pick, regardless of where the two fall in creation order. Added a test
  (`route.test.ts`) that scatters two same-coordinate stops among four
  unrelated ones and asserts they land next to each other in the output —
  confirming the behavior rather than assuming it from reading the code.
- **Manual (dragged) days are unaffected, deliberately.** `drivenOrder`
  leaves a dispatcher's order alone once any visit on the day carries a
  `routePosition` — same "algorithm suggests, human decides" rule as
  everywhere else. No adjacency guarantee there; the PRD doesn't ask for one
  on a day a person has already touched.

## 2026-09-20 — Phase 6 (P2 #2, outbox drainer)

- **Worker is a script, not an API route** (`scripts/outbox-drain.ts`, run
  via `npm run outbox:drain`), matching `rain-day.ts`/`visits-generate.ts`:
  cron invokes it directly, outside the request path, as the design brief
  specifies.
- **Provider is `console.log` for now** (`src/notifications/provider.ts`).
  No SMS/email account exists to wire up, so the swap point is a one-method
  `Provider` interface; a real Twilio/SES provider drops in without
  touching `drainOutbox`. Real provider is still open (P2 #2's other half).
- **Send-then-stamp, not stamp-then-send:** `sentAt` is only set after
  `provider.send` resolves, so a failed send leaves the row retryable next
  run instead of silently lost.

## 2026-09-20 — Phase 7 (P2 #1, blob storage for photos)

- **Vercel Blob, private access** (`src/visits/photos.ts`). `put()` gets
  `access: 'private'` and `addRandomSuffix: false` — our own uuid already
  guarantees uniqueness, and private access means the blob's own URL isn't
  enough to read it; only the server (holding `BLOB_READ_WRITE_TOKEN`) can,
  same as the dispatcher-only gate on `app/photos/[name]` already required.
  Belt and suspenders, not a new boundary.
- **`PhotoStore` is the swap point**, matching the `Provider`/`Clock`
  injection pattern already used for the outbox and for time: `savePhoto`
  and the photo route both go through it, defaulting to whichever
  implementation fits the environment.
- **Local disk survives as `localPhotoStore`, selected when
  `BLOB_READ_WRITE_TOKEN` is unset.** Dev and e2e never had a real Blob
  store token and shouldn't need one just to run `npm run dev` or the e2e
  suite — same reasoning as never pointing tests at a remote database. Only
  a deploy with the token configured (Vercel injects it once a Blob store
  is linked) uses the real thing.

## 2026-09-21 — Phase 8 (P2 #2 other half, real Twilio/Resend provider)

- **Twilio (SMS) + Resend (email), plain `fetch`** (`src/notifications/provider.ts`).
  Both APIs are a single REST call — no SDK dependency earns its keep over a
  dozen lines of `fetch`.
- **Gated per-channel on env presence, not one flag.** SMS and email are
  independent vendors with independent credentials; `defaultProvider` checks
  `TWILIO_*` and `RESEND_*` separately and falls back to `consoleProvider`
  per-channel, so an SMS-only deploy doesn't need a Resend account (or vice
  versa) just to avoid a crash.
- **`drainOutbox`'s default changed from `consoleProvider` to
  `defaultProvider`**; `drainOutbox` itself is untouched, as Phase 6
  predicted. Local dev and e2e have neither vendor's env vars set, so they
  still get the console log — same no-creds-in-dev shape as `PhotoStore`.
- **DB columns didn't change**, as the design brief predicted: `blob.pathname`
  with `addRandomSuffix: false` is exactly `uploads/<uuid>.<ext>`, the same
  string shape the disk implementation always stored.
- **Test uses a fake `PhotoStore`, not `vi.mock`** — no filesystem, no
  network, consistent with how `drain.test.ts` fakes `Provider`.

## 2026-09-21 — Phase 9 (P2 #1, real auth)

- **Magic link, chosen over passwords and OAuth** (Shane, 2026-09-21). The
  link goes through the Twilio/Resend provider we already have: SMS for crew
  leads, email for dispatchers. No passwords to store or reset, no new
  dependency. Passwords would have needed a reset flow through the same
  provider anyway. OAuth would have needed a new dependency and a work Google
  account for every crew lead.
- **`User` (role + crewId), `LoginToken`, `Session` tables.** The database
  checks that role and crewId agree (a crew user acts as exactly one crew), that
  there is an email or a phone, and that both are stored normalized (lowercase
  email, E.164 phone), because lookups match exactly.
- **Only SHA-256 hashes of tokens are stored.** Someone who can read the
  database still cannot sign in. Sessions live in the database rather than in
  a signed cookie, so deleting the row revokes one, e.g. when a crew lead leaves.
- **The link opens a confirm page, and a POST spends the token.** A GET that
  signed you in would be spent by whatever previews the link first (mail
  scanners, SMS unfurling), so the person would be left holding a dead link.
- **The link is built from `APP_URL`, never from the Host header.** A forged
  Host header would otherwise mail the victim a real token pointing at the
  attacker's domain.
- **The same reply whether or not the account exists**, including when the
  provider fails. That way the form cannot be used to find out who has an
  account.
- **Sent inline, not through the outbox.** Nothing drains the outbox yet, and a
  sign-in link is worthless by the time a drain would reach it.
- **Throttle is per user only: one link a minute.** That stops one account
  from being SMS-bombed. A per-IP limit is left out until the form gets
  scripted across many accounts (`ponytail:` note in `src/session.ts`).
- **Expired tokens and sessions are not swept.** They are refused on read and
  cost only rows. Add a cleanup when the table is big enough to notice.
- **e2e mints a login token in the database and signs in from the landing
  page.** The real link goes to a phone or inbox the test cannot read.
  `requestLink` itself is covered by `session.test.ts`.

## 2026-09-21 — Phase 10 (P2 #4: real routing API)

- **Order stays nearest-neighbor/manual; only the mileage/time number
  changes.** `estimateDrive` (`src/routes/routing.ts`) asks OSRM for the cost
  of the route already decided (round trip, fixed stop order) — never to
  re-order it. The PRD explicitly caps this project at a heuristic, not a VRP
  solver.
- **OSRM, gated on `OSRM_BASE_URL`, same shape as the Twilio/Resend gate in
  `notifications/provider.ts`:** unset falls back to the existing straight-line
  `estimate()` — no network call, nothing to configure for tests or e2e. Set
  it to a self-hosted or hosted OSRM instance to get real drive times; the
  public demo server works for a smoke test but is rate-limited.
- **Every failure mode falls back silently** (unset, network error, timeout,
  non-2xx, empty route) rather than surfacing an error — a flaky or
  unconfigured routing API degrades the number, never breaks the page. 3s
  timeout so a slow OSRM instance can't hang a route/report page load.
- **`estimate()` itself is unchanged** (sync, no network) — `route.test.ts`'s
  existing fixtures keep testing the heuristic directly. `estimateDrive` is
  the new async wrapper the two read paths (`routeFor`, `ownerReport`) call.

## 2026-09-21 — Phase 11 (P2 #1: 2-opt pass)

- **Additive, same module, no interface change.** `twoOpt` (`src/routes/route.ts`)
  is a new exported function; `nearestNeighbor` is untouched so its existing
  tests keep testing the greedy heuristic directly. `drivenOrder`'s auto
  branch runs `twoOpt(home, nearestNeighbor(home, stops))` — the manual
  (dispatcher-ordered) branch is untouched.
- **Standard 2-opt over the fixed round trip (home → stops → home):** for
  each pair of edges, reverse the segment between them if that shortens the
  tour; repeat until a full pass finds no improvement. Home is fixed at both
  ends, so only the stop segment ever reverses.
- **O(n³) worst case, fine at a crew-day's ~15 stops** (`ponytail:` note in
  `route.ts`); revisit with a neighbor-list bound if crew-days grow past ~40
  stops.

## 2026-09-21 — Phase 12 (P2 #6: timesheet export)

- **`completed` is the only eligible status.** It's the only one with both
  `startedAt` and `finishedAt` set (`src/visits/status.ts`) — `skipped` has
  `finishedAt` but never `startedAt`, so there are no hours to pair it with.
  One row per completed visit; hours = `(finishedAt - startedAt) / 3600000`.
- **A route handler, not a page** (`app/dispatch/timesheet/route.ts`), same
  shape as `app/photos/[name]/route.ts`: a dispatcher-gated `GET` returning
  `Content-Disposition: attachment`. CSV needs a download, not a render — no
  csv library, six columns and a two-line escaper cover it.
- **Reuses the owner report's week**, not a new date picker: `?week=` on the
  same Monday convention as `ownerReport` (`src/crews/report.ts`), linked
  from the report page's nav. Pure reporting — no new writes, no new query
  shape (`prisma.visit.findMany` over a week, same as `ownerReport`).

## 2026-09-21 — Phase 13 (P2 #7: customer portal)

- **The portal identity is the `Property`, not a new `Customer` entity.**
  The PRD already frames it that way ("Customer — passive in v1; exists as a
  property + agreement record"), and `Property` already carries
  `customerName`/`customerPhone`/`customerEmail`. A customer with more than
  one property signs into one property at a time in v1 — not handled, no
  report of anyone needing it.
- **Same magic-link shape as `src/session.ts` (Phase 9), in a parallel
  module (`src/portal/session.ts`) rather than folded into it.** New tables
  (`PortalToken`, `PortalSession`) mirror `LoginToken`/`Session` field for
  field — hash-only storage, single-use, 15-minute link, 30-day session,
  1-minute per-subject throttle, same "say nothing either way" reply. Kept
  separate because the subject is a `Property`, not a `User`/`Role`, and the
  existing module's `Role` type (`dispatcher` | `crew`) has no shape for
  "customer" — bolting that on would have meant a nullable/union field
  everywhere `Role` is read today.
- **Property phone/email aren't stored normalized** (seed data has
  `"918-555-0100"`, `User.phone` would have `"+19185550100"`). Rather than
  add a migration to backfill and re-key on a normalized column, the login
  match does a digits-only comparison in JS over the property table
  (`ponytail:` note in `session.ts` — scan is fine at this table's size; add
  a normalized indexed column if it isn't).
- **A new `customerSkip` in `src/visits/status.ts`, not a relaxed
  `transition`.** The crew's `transition` is crew-scoped and same-day only —
  both wrong for a customer cancelling a stop that's days or weeks out. A
  separate function, property-scoped and pending-only (`canTransition`'s own
  comment already anticipated this: "a skip from either open state, the
  customer can cancel before the crew leaves" — read here as: only from
  `pending`, i.e. before the crew is en route), reuses the same
  `canTransition` table so "what can become skipped" still has one answer,
  satisfying CLAUDE.md rule 3 without stretching the crew's transition
  semantics to fit a different actor.
- **The portal shows price; the crew view does not.** Rule 6 ("crews never
  see price") is about the crew's phone, not about price generally — the
  customer being shown their own bill is a different, allowed thing.
  `src/portal/view.ts` is its own explicit projection, same pattern as
  `crews/view.ts`, not a reuse of it.
- **No notification on a customer-initiated skip.** The crew's field skip
  doesn't send one either (only `en_route` does); a customer already knows
  they cancelled.
- **No dispatcher-side "send a portal link" button.** The customer requests
  their own link at `/portal`, same self-service shape as staff sign-in —
  nothing in the PRD asked for dispatcher-triggered onboarding.

## 2026-09-21 — Phase 14 (BO-1, BO-2: property & agreement CRUD)

- **`createAgreement` (`src/visits/generate.ts`) reuses `syncAgreement`,
  the same private helper `editAgreement` already calls.** A new signup's
  visits land on the board the moment the form submits, not on the next
  `visits:generate` run — matches BO-2's requirement and keeps horizon
  generation in one place rather than duplicating the plan/create logic.
- **The agreement edit form exposes only frequency, crew, and price** — not
  property, service type, or start date, which are identity, not terms.
  Pause/resume is a separate one-click toggle that calls `editAgreement`
  with only `{ paused }`; both already existed, this only needed a UI.
- **Property fields are never snapshotted onto a visit** (only
  `priceCents` is, per CLAUDE.md rule 1), so `updateProperty` is a plain
  `prisma.property.update` — no regeneration, matches BO-1's checklist.
- **A property can't be hard-deleted while it has any agreement**, paused
  or not — v1 has no agreement-deletion path (not in BO-2's Must-Haves),
  so in practice a property that's ever signed one stays undeletable. Not
  revisited; nothing in the PRD's Future Considerations adds one either.
- **`parseCents` added to `src/money.ts`**, the input-side counterpart to
  `usd`: a dollars-and-cents form string to integer cents, rejecting
  anything that isn't a plain non-negative amount with ≤2 decimals. Reused
  by both the agreement-create and agreement-edit forms.
- **New routes follow the PRD's own `app/dispatch/<domain>/` convention**
  (`properties/`, `agreements/`), each with its own small `actions.ts`.
  `text`/`back` helpers are duplicated per file rather than pulled into a
  shared module — matches the existing duplication between
  `dispatch/actions.ts` and `portal/actions.ts` for the same 2–3 line
  helpers, not a new abstraction for this PRD to introduce.
- **Agreement creation uses nested `connect` for its three relations**,
  matching every other `agreement.create` call in the codebase (`seed.ts`,
  the test harness) rather than scalar foreign keys, even though Prisma
  would accept either.

## 2026-09-21 — Phase 15 (BO-5: crew / service-type / user admin CRUD)

- **Three separate route trees** (`app/dispatch/crews/`,
  `service-types/`, `users/`), each with its own `page.tsx` /
  `new/page.tsx` / `[id]/page.tsx` / `actions.ts` — same shape as Phase
  14's `properties/`/`agreements/`, per the PRD's own Build Notes list of
  route names.
- **Delete guards are counted, not cascaded**, matching Phase 14's
  property/agreement guard: a `Crew` blocks on any `Agreement`, `Visit`,
  or `User` still pointing at it; a `ServiceType` blocks on any
  `Agreement`. The detail page disables the button client-side for UX,
  and the server action re-checks independently (verified by posting the
  delete action directly against a referenced crew and service type —
  the disabled button is not the only thing stopping it).
- **User email/phone reuse `normalizeLogin` (`src/session.ts`)** per
  field, rather than a new normalizer — the admin form's stored value has
  to match exactly what sign-in looks up by, and that function was
  already the single source of truth for the normalized shape.
- **Deleting a `User` is what revokes their sessions** — `Session` and
  `LoginToken` both already `onDelete: Cascade` off `User`
  (`prisma/schema.prisma`), so BO-5's "deactivating/deleting a user
  revokes their sessions" checklist item needed no new code, only the
  admin UI to reach `prisma.user.delete`. Verified: requested a real
  sign-in link for a test user (a `LoginToken` row existed), deleted the
  user, and the row was gone.
- **No "can't delete yourself" or last-dispatcher guard** — not in BO-5's
  checklist, and the PRD's Non-Goals don't ask for an office/admin role
  distinction either (that's explicitly Future Considerations). Revisit
  if an admin ever locks themselves out in practice.
- **Switching a `User` from crew to dispatcher role clears `crewId`
  server-side** rather than erroring if the form's crew dropdown still
  has a stale selection — the write always derives `crewId` from `role`,
  so there's nothing to validate there and no extra client JS to keep
  the dropdown in sync.
- **`estimatedMinutes` isn't snapshotted onto `Visit`** (only `priceCents`
  is — CLAUDE.md rule 1), so editing a `ServiceType` is a plain update,
  same boundary as Phase 14's property edit.
- **Manually walked create → dup-name/dup-contact rejection → invalid-field
  rejection → edit → delete-guard → delete** for all three entities
  against dev data via a magic-link session (no browser UI automation
  available in this environment, so the walkthrough posted the rendered
  forms' own progressive-enhancement encoding directly with curl — same
  code path a real no-JS form submission takes). Test crew, service
  type, and user cleaned out of the dev DB after. `npm test` 103/103;
  no new automated tests, following Phase 14's precedent of manual
  verification for this class of CRUD action.

## 2026-09-22 — Phase 16 (BO-3: `Job` entity + fast-path placement)

- **`Visit` carries its own `propertyId` / `serviceTypeId`, copied from its
  origin at creation.** This overrides the PRD's "branch on which of
  `agreementId`/`jobId` is set" in every reader. The sweep was 15 files, not
  the PRD's 4, and branching in each one is 15 chances to miss one. Copying
  is safe because an agreement's property and service type were already
  uneditable (the agreement form only changes frequency, crew, price, and
  paused). The migration now enforces that with triggers: a visit whose copy
  disagrees with its origin is refused, and so is an agreement or job whose
  property or service type changes.
- **Exactly one origin:** `CHECK (num_nonnulls("agreementId", "jobId") = 1)`.
  Origin foreign keys are `ON DELETE RESTRICT`, not Prisma's `SET NULL`
  default for optional relations, which would have orphaned a visit.
- **`Job` stores property, service type, price, and `createdBy` (a name) only.
  No crew or date.** The visit carries crew and date, and it is the source of
  truth (rule 5), so the job cannot go stale after a reschedule. `createdBy`
  is a name, like `CapacityOverride.by`, rather than a `User` foreign key, so
  deleting a user never blocks on their jobs. To supply the name, the
  dispatcher `Role` now carries it, and `requireDispatcher()` returns it.
- **A make-up keeps its origin.** A job's make-up is a second visit on the
  same job. `@@unique([jobId, occurrenceDate])` does for jobs what the
  agreement index already did: `occurrence + 1` is a slot nothing else takes,
  and booking twice is refused.
- **No capacity check** (PRD Non-Goal, owner decision). **No past dates:** a
  crew can only update today's stops, so a job placed in the past could never
  be completed. **No job deletion**, the same as agreements (Phase 14).
  Property and service-type delete guards now also count jobs.
- **Seed places 2 one-off jobs today**, so the demo board mixes agreement and
  job visits. The e2e fixture (`e2e/global-setup.ts`) is separate and
  unchanged.

## 2026-09-22 — Phase 17 (BO-4: Stripe invoicing)

- **No Stripe SDK.** The app makes three Checkout calls (create, retrieve,
  expire) and checks one signature, so it uses `fetch` + `node:crypto`
  (`src/billing/stripe.ts`), the same way `provider.ts` calls Twilio/Resend.
  Writing the signature check here also lets its 5-minute replay window read
  the injected clock (rule 2). The SDK reads `Date.now()`.
- **An invoice is one property's completed visits.** A crew or date-range
  filter that spans several customers drafts one invoice per property. Only
  `completed` visits can be invoiced. The amount is the sum of the visits'
  snapshotted prices, fixed when the invoice is built. **No amount override
  yet.** The PRD allows one, but nothing needs it; add it on the draft page if
  a discount is asked for.
- **`Visit.invoiceId` is a plain foreign key**, so a visit is on at most one
  live invoice. The claim is a conditional update (`invoiceId IS NULL`), so two
  dispatchers building at once cannot both take a visit. **Voiding releases the
  visits.** The cost is that a void invoice no longer lists what it covered.
  Its amount and timestamps stay.
- **At most one Checkout Session per invoice is open, and it is the one stored
  on the row.** This is what keeps the money safe. A new session is opened
  only after Stripe says the stored one `expired` (checked by `retrieve`, not
  by our clock). Void and mark-paid expire the stored session first. They are
  refused if Stripe reports it `complete`, meaning the customer paid and the
  webhook is on its way. Each of those moves is also conditional on the
  session id it closed, so a pay tap that swapped in a new session during the
  close makes the move fail rather than leaving the new session payable.
- **The webhook is idempotent in two ways.** `StripeEvent(id)` is inserted in
  the same transaction as the change (`createMany … skipDuplicates`), so a
  redelivery is a no-op. Every status write is also conditional on the
  statuses it may come from, so events arriving out of order cannot walk a
  paid invoice back to `payment_failed`. Unknown invoices and unhandled event
  types are recorded and answered 200, so Stripe does not retry them forever.
  A processing error answers 500 and rolls back the event row, so Stripe does
  retry that.
- **Events handled:** `checkout.session.completed` (only when
  `payment_status = paid`), `checkout.session.async_payment_succeeded` /
  `_failed`, `payment_intent.payment_failed`, and `charge.refunded` (full
  refunds only). The invoice id travels in session metadata and in payment
  intent metadata, so a payment failure that arrives before any completion can
  still be matched.
- **`Notification.visitId` is now nullable.** An invoice's pay link goes
  through the same outbox with no visit attached. This also settles the BO-7
  open question: nullable was the smaller migration.
- **Report:** the per-crew "Revenue" column is now "Scheduled value", and the
  field is renamed to match (`scheduledCents`). Below the table,
  "Invoiced this week" and "Collected this week" come from `Invoice.sentAt` /
  `paidAt` in the Chicago week. These are totals only, not per crew, because
  an invoice belongs to a customer, not a crew.
- **No fake Checkout for local dev.** Without `STRIPE_SECRET_KEY`, sending
  refuses with "Stripe is not configured". Tests inject an in-memory
  `Checkout`, and webhook tests sign fixtures with the same HMAC Stripe uses.
  A live demo needs test-mode keys plus
  `stripe listen --forward-to localhost:3900/stripe/webhook`.

## 2026-09-22 — Phase 18 (BO-8: per-person clock in/out)

- **`TimeEntry` (userId, name, crewId, date, clockIn, clockOut).** The
  migration adds a partial unique index — one open entry per user — and a
  check that `clockOut > clockIn`. The index is the double-tap guard, not a
  read-then-write in the handler.
- **Deleting a user keeps their hours.** Deleting is how access is revoked
  (Phase 15), so `userId` is `onDelete: SetNull` and the row carries a `name`
  snapshot; the timesheet still names them. An open shift on a deleted user
  stays open and shows as "still clocked in" — close it in the database if it
  ever matters. A crew with hours on record cannot be deleted (counted guard,
  same as its visits).
- **A shift belongs to the day it started** (`date` = Chicago `LocalDate` of
  clock-in). A 22:00–01:00 shift is three hours on the first day, not split.
- **The crew role now carries `userId` and `name`.** Clock in/out takes the
  person from the session, never the form. Clock-out closes that person's
  open shift wherever it was opened, so a crew reassignment mid-shift cannot
  strand it.
- **Timesheet CSV has two blocks.** First, per person per day: summed closed
  shifts (rounded once, after summing) and a "still clocked in" flag — an
  open shift is flagged, never estimated. Then, unchanged, one row per
  completed visit with its on-site time, relabelled "Hours on site".
- **The PRD's "whose name is on this visit" column doesn't exist.** Visits
  record the crew, not which person completed them. Adding `completedById`
  would touch the state machine and wasn't asked for beyond that line; the
  visit block names the crew as before.

## 2026-09-23 — Phase 19 (BO-6 search, BO-7 messaging, BO-9 range report)

- **Search is a plain `ILIKE` over `Property`** (name, address, phone, email),
  on the properties list via `?q=`. The board and report headers carry a box
  that submits there. No index; add `pg_trgm` if the table outgrows a scan.
  Phone is a raw substring, so "555-0100" finds it but "5550100" does not —
  properties aren't stored normalized (Phase 13).
- **Messaging reuses the outbox untouched.** `src/notifications/announce.ts`
  writes `Notification` rows with `visitId` null (made nullable in Phase 17).
  The drain worker and provider are unchanged.
- **A crew-day message goes to customers still on the route:** `pending` and
  `en_route` stops, one message per property. Skipped stops are off the route
  and completed ones are finished, so neither hears "running late". Refused
  when nobody is left. Body is 1–320 characters, prefixed with the company name.
- **The quarter view is `rangeReport(firstMonday, weeks)`**, one visit query
  grouped in memory into weeks, crews and customers. Default 13 weeks, 1–52.
  Same definitions as the weekly report; no miles (a drive estimate per
  crew-day isn't what a trend is for) and no export.
- **"Per crew lead" is per crew.** A visit records its crew, not the person
  (Phase 18), so crew is the finest grain that exists.

## 2026-09-23 — Portal-UX Phase 19 (PX-2, confirm step on customer cancel)

- **Cancel is GET-preview / POST-commit.** "Cancel this visit" in the portal is
  now a link to `/portal/cancel/[visitId]`, which shows service, date and price
  and offers "Yes, cancel this visit" (the unchanged `requestSkip` action) or
  "Keep it". No client JS.
- **The preview reuses `propertySchedule`**, so it is scoped to the signed-in
  property and to still-`pending` visits. Someone else's id, a stale id and a
  started visit all land on the same "no longer open" message.
- **Reschedule's half of PX-2 waits for PX-1** (portal-UX Phase 20): there is
  no reschedule action to put a confirm step in front of yet.

## 2026-09-23 — Portal-UX Phase 20 (PX-1 open-calendar reschedule + review queue, PX-2's reschedule half)

- **Reschedule is skip-then-`bookMakeUp`.** `requestReschedule` validates the pick,
  calls `customerSkip`, then `bookMakeUp(…, { reschedule: true })`. No new
  visit-movement path: the new visit keeps the original's snapshotted price,
  detaches, and takes the make-up slot (`occurrenceDate + 1`).
- **The window is tomorrow through 60 days, weekdays only.** Tomorrow because a
  crew can only act on today's stops (Phase 3); weekdays because `isServiceDay`
  is the only calendar the crews have. Same-day moves are a dispatcher's call.
  A customer may pick an *earlier* day than the original — `bookMakeUp`'s
  "after the skipped day" rule is relaxed only under `reschedule`, which still
  refuses the same day.
- **Capacity is decided inside the booking, not at preview.** The GET preview
  (`fitsOn`) only tells the customer which outcome to expect; the commit tries
  `bookMakeUp` and catches `CapacityExceeded`, so a day that filled after the
  preview becomes a request rather than an overbooking or an error.
- **A queued request leaves the original skipped.** PRD: the skip happens at
  confirm. The portal says the old visit is "on hold" until the office replies;
  a decline leaves the skip with no make-up (the board's normal make-up offer
  is still the dispatcher's recovery).
- **Approve is the existing override, logged.** `bookMakeUp` gained
  `override` (writes a `CapacityOverride` row like `commitCascade`) and an
  `after` hook that runs in the booking's transaction, so marking the request
  `approved` and creating the visit succeed or fail together; a second approve
  finds nothing pending and books nothing.
- **Decline needs a note; the portal shows it and says to call the office.**
  Picking again after a decline is not self-service — the visit is already
  skipped, and the portal lists only pending visits. No decline notification
  is sent; the portal is the channel. Pending/declined requests show on the
  portal until their requested date passes.
- **Queue lives at `/dispatch/reschedules`**, linked from the board header with
  a pending count.

## Portal-UX PX-6 — "stops done" counter (2026-09-23)

- **No change needed.** The crew header already counts only `completed` +
  `skipped` (`app/crew/[crewId]/page.tsx`, since Phase 3); `en_route` never
  counted. The PRD's premise was stale. The report and the header each spell
  the two statuses inline, so there is no shared "resolved" list to reuse —
  not worth creating for two call sites.

## Portal-UX PX-3 — service history + photos (2026-09-23)

- **New route, `app/portal/photos/[name]`; the dispatcher route is untouched.**
  Access is "this photo is the before/after of a visit at the signed-in
  property" (`propertyOwnsPhoto`), checked per request from the portal cookie.
  Signed out is 401; not-yours and not-found are the same 404, so a name can't
  be probed for existence. Same name-shape and type checks as the dispatcher
  route.
- **History shows completed and skipped, newest first, unpaginated** (PRD).
  Skipped visits reuse `SKIP_REASONS`; reason `other` shows just "Skipped",
  because its explanation lives in the crew note.
- **The crew note is never sent to the portal.** It is written for the office
  (`propertyHistory` doesn't select it), so nothing internal can leak by
  accident.
- **Thumbnails are the full photo at 96px** — no resize pipeline; the
  cache header makes repeat views cheap. Add resizing if photo sizes bite.

## 2026-09-23 — Portal-UX Phase 23 (PX-4 crew look-ahead)

- **Next three service days, not "tomorrow"**, at `/crew/[crewId]/ahead`
  (`nextServiceDay`, so Friday shows Mon–Wed). The PRD allows either; three
  covers a long weekend without a picker.
- **Each day comes from `crewDay`**, so ordering is `routeFor`'s `drivenOrder`
  and price is never in the projection — no second query, no second ordering.
- **Read-only by construction**: the page renders no forms and imports no
  actions; acting stays "today only" in the state machine (Phase 3). Status,
  skip and note fields are deliberately not shown — a future day is all pending.

## 2026-09-23 — Portal-UX Phase 23 (PX-5 bulk rain-day push)

- **N single-crew commits, sequential, never one transaction.** `commitAllCrews`
  loops `commitCascade`; a stale day or an un-overridden overflow fails that
  crew alone (returned as `error`) and the others still land.
- **Bulk keeps every stop on the target day.** Per-visit "push further" stays on
  the single-crew page (`Resolve stop by stop` link per non-clean row). A
  collision crew therefore commits as "keep both", the same default as the
  script; the row says so before the dispatcher commits.
- **One override reason covers every overflow crew**, logged per visit as
  usual. Crews that don't overflow ignore it.
- **`/dispatch/rain/[date]`, entered from the board** for today. The date is in
  the URL like the single-crew preview; the commit posts `crewId:visitId`
  pairs, so the stale check is per crew.
- Unit-pinned in `cascade.test.ts` (one stale crew, one good one); e2e is
  preview-only, since the single-crew spec owns the commit path.

## 2026-09-23 — Portal-UX closure choices

- **Bulk commit is now e2e-pinned** with two dedicated seed crews (`E2E Bulk A/B`)
  working only on today+10 (`BULK_OFFSET`), so committing never touches another
  spec's day.
- **Stripe in the demo: exercise it with real test keys**, not concede it.
  Needs `sk_test_…` and a `stripe listen` `whsec_…` from the operator.
- **Closure order: DEMO.md, then the exec-brief, then LinkedIn drafts.**
- **No WRITEUP.md entries for Portal-UX**; decisions.md carries them (the
  write-up rule covers only the three core learning artifacts).
- PRD checkboxes in `prd-groundwork-portal-ux.md` ticked: all items shipped.

## SEC-01 / SEC-02 (2026-09-23)

- Changing a property's customer email or phone deletes its `PortalSession` and `PortalToken` rows (`revokePortalAccess`), so a previous owner's cookie is refused next request. Other edits do not revoke.
- `defaultProvider` throws in production when the channel has no provider, instead of falling back to the console; `consoleProvider` prints the body only when `NODE_ENV=development`, because sign-in links ride in it. Cost: a production build with no Twilio/Resend cannot send links (the outbox drain also throws and leaves rows unsent, which is the correct failure).

## SEC-07 / SEC-08 (2026-09-23)

- **Last dispatcher:** `withoutDispatcher` (`src/users.ts`) locks every dispatcher row, then refuses a demotion or delete that leaves none. A save that keeps the role skips the lock. Not covered: a user with no session deleting themselves while another dispatcher exists is allowed.
- **Reschedule is one transaction:** `customerSkip` takes a `Tx`, and `bookMakeUp` gained a `before` hook that runs first in its transaction. Any refusal rolls the skip back, so the visit stays pending. A full day (`CapacityExceeded`) still rolls back, then a second transaction skips and creates the `RescheduleRequest` together.

## DG-03 (2026-09-24) — rain-day states

- **Per-crew push page shows one labelled callout per state** (Empty, Clean push, Collision, Overflow; Stale when the commit was refused with `STALE_MSG`, exported from `cascade.ts` so the page and the refusal cannot drift). The commit button names what it will do: `, keeping the double-booked visits` or ` over capacity, logged as an override`; the `Push N stops` prefix the e2e reads is unchanged.
- **The all-crews page keeps its table.** Its Result column already carries collision and overflow per crew, and stale there is per crew in the commit message.
