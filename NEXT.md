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

**Closure deliverables are done (2026-09-23):** `docs/DEMO.md` (commands run
against a live seed), exec-brief **Groundwork in Brief**
https://claude.ai/artifact/HX28FGarRjEQzkLiMyrReU (source `docs/groundwork-in-brief.html`),
and four LinkedIn drafts in the Ledger (https://claude.ai/artifact/Ai5xKScgT2sWtqXRQ1ZA8i),
posts #45–#48, project "Groundwork", queued with no adjacent same pillar.
**Design canvas** (23 artboards, made from `docs/design-spec-brief.md`): https://claude.ai/artifact/Eh4nfqCDnWbcLatzPoVZVf. Next item: implement it per the brief's §7 (tokens, shared components, then crew, portal, dispatch; one surface per commit; the Hand-off artboard has the token block and the string list).
Still open: the header of `WRITEUP.md` (repo/live links, status, "Hardest Bug",
"By the Numbers") is still the unfilled template; the brief has no screenshots
(no capture spec exists).

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


---

## Security findings — saas-foundation audit (2026-09-23)

**SEC-01 and SEC-02 done 2026-09-23** (`npm test` 145/145): a contact change revokes portal sessions and tokens (`revokePortalAccess`); an unconfigured channel throws in production and the console provider logs bodies in development only. Note: `npm start` with no Twilio/Resend now fails sign-in requests — the demo must run `next dev` or mint a token.

Source: `~/Projects/saas foundation/FOUNDATION_SPEC.md` §3 (read-only audit). Line numbers are as of 2026-09-23 — **re-verify before fixing**. IDs are `SEC-nn` so they cannot collide with this repo's numbering; convert to a native item when picked up. ✔ = re-read by the main session; others reported by an audit agent with file:line.

| ID | Sev | Finding | Fix | Acceptance |
|---|---|---|---|---|
| SEC-03 | **Done 2026-09-23** (`e2e/headers.spec.ts`). | No security headers (`next.config.ts:3-9`, no middleware): no frame-ancestors (one-button dispatcher forms are clickjackable), no Referrer-Policy. | Global `headers()`. | Header asserted on dispatch and portal routes. |
| SEC-04 | LOW | Only a per-account cooldown on link requests (`src/session.ts:46`); the phone portal lookup is O(n) (`src/portal/session.ts:31-37`). | Add a per-IP Postgres limit; index or normalize the phone lookup. | Burst from one IP across accounts refused after N. |
| SEC-05 | **Deferred:** the limit is global to server actions and photos upload through one (`completeStop`); a per-route limit needs the upload moved to a route handler. | The 21 MB `bodySizeLimit` applies to every server action, including anonymous `askForLink` / `askForPortalLink` (`next.config.ts:8`). | Keep the large limit on the photo upload route only. | A 2 MB anonymous POST is rejected. |
| SEC-06 | **Done 2026-09-23** (ownership checked before save; cleanup via `PhotoStore.remove`; no new test, crew e2e 6/6). | Crew photos are stored before `transition` checks visit ownership, and the cleanup uses local `fs.rm`, which does nothing on Blob (`app/crew/[crewId]/actions.ts:26, 40-45`). Storage cost only; not readable. | Check ownership first; clean up through `PhotoStore`. | Refused upload leaves no blob. |
| SEC-07 | **Done 2026-09-23** (`src/users.ts`, `src/users.test.ts`). LOW | `updateUser` / `deleteUser` do not protect the last dispatcher (`app/dispatch/users/actions.ts:62-84`). | Refuse to demote or delete the last dispatcher. | Test. |
| SEC-08 | **Done 2026-09-23** (`before` hook on `bookMakeUp`; test in `reschedule.test.ts`). LOW | `requestReschedule` runs `customerSkip` then `bookMakeUp` outside one transaction (`src/visits/reschedule.ts:44-55`); a non-capacity failure leaves the visit skipped with no make-up. | One `$transaction`. | Fault-injected booking failure leaves the visit unchanged. |


---

## Design implementation: open gaps (2026-09-23)

The design canvas (https://claude.ai/artifact/Eh4nfqCDnWbcLatzPoVZVf) is implemented (commit `bc30058`; `npm test` 142/142, e2e 22/22 on a production build). IDs are `DG-nn` (a screen or state the design shows that the app lacks, or the reverse) and `CG-nn` (code, test or tooling). Pick up by ID; convert to a native item when started.

**Rule for closing any of these:** keep the strings the e2e suite reads (list on the canvas's Hand-off artboard); one surface per commit; `npm test`, then the touched spec on a production build; never run alongside another project's sweep (a shared machine starved two of this session's runs).

### In the design, not built

| ID | Gap | Where | Acceptance |
|---|---|---|---|
| DG-01 | **Done 2026-09-23** (`boardSummary` in `src/crews/board.ts`, unit-tested). Board summary cards: "Waiting for you" (pending requests) and "Today" (stops, done, en route). The request count is only the nav badge. | `app/dispatch/page.tsx` | Both cards render from real counts; a test seeds a request and a completed stop. |
| DG-02 | **Done 2026-09-23** (dispatch e2e 9/9; "N/M stops" string kept). Route-page summary strip with a load meter (stops, hours, distance, order). Today it is one meta line. | `app/dispatch/[crewId]/[date]/page.tsx` | Strip shows live/max stops and hours and the estimate label; `.meter` reuses the board's. |
| DG-03 | **Done 2026-09-24** (labelled callout per state on the push page, stale via `STALE_MSG`; dispatch e2e 9/9; all-crews table left as is). Rain day as five distinct states (empty, clean, collision, overflow, stale). The all-crews page is a table; the per-crew page has one state line. | `rain/[date]`, `[crewId]/[date]/push` | Each state has its own labelled callout and the commit button says what will happen; stale keeps "Update preview". |
| DG-04 | Inline per-field form errors (`.err` under the field). Forms still redirect with one flash message. | every `actions.ts` with a form | A bad price marks that field and keeps the rest of the input; no client JS. |
| DG-05 | **Done 2026-09-23** (`decidedRequests`, new `decidedBy` column; `npm test` 149/149, portal e2e 4/4). "Recently decided" (approved and declined) list on the reschedule queue. Only pending shows. | `app/dispatch/reschedules/page.tsx`, `src/visits/reschedule.ts` | Last N decided requests listed with who decided and the decline note. |
| DG-06 | **Done 2026-09-23** (Send disabled with reason; side-by-side layout skipped). Invoices: list and detail side by side; a disabled Send with the "Stripe not configured" reason up front. Today Send is enabled and refuses on click. | `app/dispatch/invoices/` | Send disabled with the reason when `STRIPE_SECRET_KEY` is unset. |
| DG-07 | **Done 2026-09-23.** Portal greeting ("Hi, <first name>"). | `app/portal/page.tsx` | Uses the property's customer name. |
| DG-08 | **Done 2026-09-23** (past-visits list; a customer cancel is a skip with `customer_request`). "Cancelled" chip for a visit the customer cancelled. The portal lists only open visits. | `src/portal/view.ts`, `app/portal/page.tsx` | Recent cancelled visits show with a dashed "Cancelled" chip and no actions. |
| DG-09 | **Done 2026-09-24** (`fullDays` in `src/visits/reschedule.ts`, one window query, tested against `fitsOn`; `npm test` 150/150, portal e2e 4/4). Calendar day hints (open vs full). It marks weekdays only; the confirm step says whether it books. | `app/portal/reschedule/[visitId]/page.tsx` | Full days are marked without a per-day query storm (one query for the window). |
| DG-10 | Decision needed: design copy not adopted so the tests stay stable ("Not started", "Completed", "Push anyway and log it", "Decline with a note", "Directions in Maps"). | Hand-off artboard | Choose per string; a change updates its e2e assertion in the same commit. |

### In the app, never designed

| ID | Gap | Note |
|---|---|---|
| DG-11 | Crew clock in/out card, Map/Call/Text links, message-the-day form, add one-off job, auto-order control. | Restyled only through element styles. Need artboards. |
| DG-12 | Properties list and detail, agreements new/detail, users, crews, service types, invoice create, property new. | Same. Add to the canvas, then check against the code. |
| DG-13 | Timesheet CSV has no screen (route only). | Fine as is; note for the design's scope. |

### Code, tests and tooling

| ID | Gap | Note |
|---|---|---|
| CG-01 | **Done 2026-09-23.** Walked the app at 390px and 1280px, light and dark, against the canvas. Fixed: search field stacked over its button, reorder arrows stretched full width, rain-day button squashed on phones, rest days reading "0/8 stops", the portal change panel cramped. Dark mode and the reschedule calendar looked right. Left as is: the phone nav scrolls sideways with no cue, and the route page's reorder buttons sit on their own row. | Re-walk after any DG item; `docs/DEMO.md` (CG-07) is the script. |
| CG-02 | No e2e for the reschedule calendar's off days, the nav badge, or the phone day list (only the calendar happy path is exercised). | Add small specs; the daylist and the table both render the same links, one is `display:none`. |
| CG-03 | `next/font/google` fetches the font at build time, so an offline build fails, and the build warns "Failed to find font override values". | Switch to `next/font/local` with a committed font file if offline or CI builds matter. |
| CG-04 | `app/dispatch/layout.tsx` deliberately does not redirect (it raced the pages' own `requireDispatcher`, closing the stream). | Keep. Do not "fix" it by adding `requireDispatcher` there. |
| CG-05 | Design says 40px targets on the desk, 48px on crew and portal; the CSS keys this off `.desk` vs `.crew` only. Sign-in and portal pages inside `.crew` are right; check any desk page using `.crew`. | Audit once with the CG-01 walkthrough. |
| CG-06 | The logo set (https://claude.ai/artifact/AXnAyTm6dgbjs5tvTAZAZB) is not wired in: no favicon or app icon. | `app/icon.svg` (auto-picked by Next) and an `apple-icon`; add a sized PNG if needed. |
| CG-07 | `docs/DEMO.md` predates the design (screen names, nav labels, "Requests"). | Refresh after CG-01 and add a screenshot capture spec, so the exec-brief can carry two real screenshots. |
| CG-08 | `WRITEUP.md` header (repo and live links, status, Hardest Bug, By the Numbers) is still the template. | Carried from closure. |
| CG-09 | The reschedule calendar renders every month in the 60-day window (about three cards) on a phone. | Consider showing one month with prev/next links (GET). |
