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
