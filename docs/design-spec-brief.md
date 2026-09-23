# Groundwork — brief for a full design spec

**Ask:** produce a complete design spec (visual language, component library, and every screen in every state) for Groundwork, so the existing working app can be re-skinned and extended without re-deciding anything ad hoc.

The app is built and tested. It has **no design system yet**: one 76-line stylesheet (`app/globals.css`), system fonts, a green accent, light theme only. Behaviour is settled; presentation is not. The spec should describe what the app *should* look like, and flag anywhere the current build has to change to get there.

> **Synthetic data only.** "Evergreen Property Care" is fictional (3 crews, 120 Tulsa properties). Use it, or an equally plausible lawn-care company, for all sample content.

## 1. The product in one paragraph

Scheduling and dispatch for a field-service company. Standing agreements ("mow every Tuesday") generate real visit records weeks ahead. A dispatcher plans each crew's day on a weekly board, a crew lead runs the day from a phone, and a customer can see history and photos, cancel a visit or ask to move it. A rain day moves a whole crew-day in one previewed action. Invoices are paid by card through a hosted checkout.

The design has to make one thing feel trustworthy above all: **the schedule is the promise to the customer.** Anything that changes it must show what will happen before it happens, and afterwards say what did.

## 2. Users and their conditions

| Surface | Who | Device and conditions | What design must optimize for |
|---|---|---|---|
| **Crew** `/crew/…` | Crew lead, in a yard | Phone, one hand, sun glare, gloves, patchy signal | Glanceable, 48px targets, gate code and dog warning impossible to miss, no reliance on hover or drag |
| **Dispatch** `/dispatch/…` | Owner or office dispatcher | Desk, wide screen, but must survive a phone | Density, scannable load per crew per day, safe bulk actions |
| **Portal** `/portal/…` | Homeowner, non-technical, arrives from a text link | Phone, first-time, no account | Calm, plain language, obvious what a button will do before pressing it |
| **Sign-in** `/`, `/login/…` | All staff | Any | One field, no password, expiry stated |

## 3. Non-negotiable constraints (they shape the design)

1. **Phone first, 390px reference width.** The dispatch board scrolls sideways inside its own box; the page never does.
2. **Thumb targets of at least 48px** on crew and portal.
3. **No client-side JavaScript is required for the crew flow** (server actions, native `<details>`, radios, `required`). Designs should be achievable with native disclosure, forms and links. Anything needing drag, hover, or live client state must be flagged, not assumed.
4. **Crews never see price.** No crew screen has a place for a price. The portal shows price; the crew note ("written for the office") never appears in the portal.
5. **Money is whole cents**, shown as dollars with two decimals. **Dates are local (America/Chicago)** short days, e.g. "Wed, Sep 23".
6. **Preview before commit** for every action that changes the schedule for other people (rain-day push, cancel, reschedule). Preview is a GET, commit is a POST, so the preview is a real page.
7. **Errors and blocked states say what happened and what to do next.** Sign-in never reveals whether an account exists (same message either way).
8. **Distances are estimates** (straight-line unless a routing service is configured), and the UI should say "estimate" rather than imply drive time.

## 4. Screen inventory (the spec must cover each, in each listed state)

**Sign-in**
- Request link (`/`): idle, "link sent", "expired or already used". Customer portal has its own request page (`/portal`).
- Link landing (`/login/[token]`): confirm button; expired.

**Dispatch**
- **Weekly board** `/dispatch`: crews × 7 days; each cell shows stops and hours against limits. Cell states: empty (rest day), normal, full, over capacity, today. Week navigation; "Find a customer" search; entry points to Rain day, reports, admin.
- **Crew-day route** `/dispatch/[crew]/[date]`: ordered stops with address, service, access notes, status; reorder (↑/↓ buttons, not drag); estimated miles and minutes; **skip → "Book make-up"** offer; move a stop; add a call-in job. Visit statuses: pending, en route, completed, skipped (with reason).
- **Rain day** `/dispatch/rain/[date]` and per-crew push: **five preview states** to design distinctly: empty, clean, collision (same property already booked that day), overflow (over capacity, allowed but logged), stale (day changed since the preview; nothing moved). All-or-nothing result and per-crew failure summary.
- **Reschedule requests** `/dispatch/reschedules`: queue of pending, approved, declined; decline requires a note.
- **Properties, agreements, jobs:** list + search, detail, create/edit forms (recurrence frequency, price, crew, start date), one-off job placement.
- **Invoices:** list, create, detail with send / void / mark paid, status chips, "Stripe not configured" state.
- **Reports:** weekly owner report (completion, revenue, miles per crew), quarter trend, timesheet CSV download.
- **Admin:** crews (home yard, max stops, max hours), service types, users.

**Crew phone**
- **Today** `/crew/[id]`: header with stops-done counter; one card per stop (address, service, access-notes callout in amber, status); actions Start / Complete (photo, note) / Skip (reason required, note when reason is "other"). Empty day, all done.
- **Look-ahead** `/crew/[id]/ahead`: read-only upcoming days.

**Customer portal**
- Schedule (`/portal/[token]`): upcoming visits, invoices with pay action, pending/declined reschedule requests, past visits with photos.
- Cancel confirm (`/portal/cancel/[visit]`): states what will be cancelled and its price.
- Reschedule (`/portal/reschedule/[visit]`): open calendar; confirm says whether it books immediately or goes to the office for review; "on hold" wording while pending.

## 5. What the spec must deliver

1. **Design language:** colour (light *and* dark; the app is light-only today, so decide), type scale and faces, spacing, radius, elevation, iconography, motion (restrained; reduced-motion respected). Start from the current identity (warm neutral ground `#f6f5f1`, deep green `#2f6b3a`, amber for warnings, red for problems) or replace it deliberately and say why.
2. **Semantic colour system** separate from brand: visit status, load level (empty/normal/full/over), invoice status, request status. Every state must also be distinguishable without colour (label or icon).
3. **Component library** with states: buttons (primary, secondary, danger), status chip, stop card, board cell, route list row, callout (access note, warning, alert), form field and error, preview summary, empty state, confirm step, toast/flash message, table (dense desk table and stacked phone version).
4. **Every screen in section 4** at 390px, plus dispatch screens at ~1100px, in every listed state, with real sample content (no lorem).
5. **The one hero flow, storyboarded:** rain day, from board → preview (all five states) → commit → board reflow → what the customer is told.
6. **Content and voice:** button labels that say what happens, error and empty-state copy, the customer-facing message wording, terms (visit, stop, crew-day, make-up, rain day) used consistently.
7. **Accessibility:** WCAG 2.2 AA contrast in both themes, visible focus, 48px targets, labels on every control, no colour-only meaning, screen-reader order for the stop card.
8. **Implementation notes:** how each token maps to CSS custom properties, and a list of screens that need markup changes versus a stylesheet-only re-skin.

## 6. Out of scope

- Native apps, live GPS or map tiles, turn-by-turn navigation (a deep link to the phone's maps app is enough).
- A marketing site or logo work beyond a wordmark treatment.
- Changing behaviour: the state machine, recurrence rules and permission rules are fixed. If a design needs a behaviour change, raise it as a question; do not assume it.

## 7. Known weak spots the spec should resolve

- Route reorder is ↑/↓ buttons; the original requirement said drag. Propose a design that works without client JS, or say what a drag version costs.
- The dispatch board is a wide table forced onto a phone; propose a better phone treatment than sideways scroll if one exists.
- Overflow (over-capacity) is currently only a red cell; it needs a clear "allowed but logged" pattern.
- The portal shows one property per customer; note where a multi-property customer would break the layout.

## 8. Reference

- Current styles: `app/globals.css`. Screens: `app/`. Behaviour and rationale: `docs/decisions.md` (dated; outranks the PRD). Requirements: `prd-groundwork-field-service.md`, `prd-groundwork-back-office.md`, `prd-groundwork-portal-ux.md`.
- Run it: `docs/DEMO.md` (seed, sign-in links printed to the dev terminal, screen-by-screen tour). Running app on `:3900` is the fastest way to see current state.
- `docs/design-brief.md` is an older **engineering** handoff, not this document.
