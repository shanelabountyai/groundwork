# Groundwork — demo script

~10 minutes. **Synthetic data only**: "Evergreen Property Care" is fictional, 120 Tulsa properties, 3 crews.

## Setup (once, ~1 min)

```bash
npm run db:seed -- --reset     # 3 crews, 120 properties, 4 weeks back + 4 weeks ahead
npm run dev                    # http://localhost:3900 — leave this terminal visible
```

Sign-in is a real magic link, but SMS/email aren't configured locally, so **the link prints in the dev-server terminal**:

```bash
# in the terminal running `npm run dev`, look for
[notify] email -> dispatch@evergreen.example: Groundwork sign-in: http://localhost:3900/login/<token> (expires in 15 minutes)
```

Links expire in 15 minutes and work once — mint a fresh one if it dies.

| Who | Enter at `/` | Lands on |
|---|---|---|
| Dispatcher | `dispatch@evergreen.example` | `/dispatch` |
| Crew lead (Midtown) | `+19185550150` | `/crew/<id>` (open on a phone, or a 390px window) |
| Crew lead (South Tulsa / East) | `+19185550151` / `+19185550152` | same |
| Customer | `918-555-0101` at `/portal` (email `sage.abernathy@example.com` also works, for `918-555-0100`) | `/portal/<token>` |

Accounts live in `scripts/seed.ts`; there are no passwords anywhere.

## Screens

1. **Weekly board — `/dispatch`.** Crews × days, coloured by load against capacity. *Say:* "Every cell is real rows, not a calendar computed on the fly — that's what lets one visit detach from its pattern."
2. **A crew-day — click a cell.** Route order, distance and minutes. *Say:* "Distances are straight-line estimates unless a routing server is configured." Reorder is ↑/↓ buttons.
3. **Crew phone view — sign in as `+19185550150`.** Start, finish, skip with a reason, photo. *Say:* "Crews never see price — the view is an explicit projection, so a new field has to be added on purpose."
4. **Rain day — the headline.** In the terminal:
   ```bash
   npm run rain-day -- --crew=Midtown            # preview only
   npm run rain-day -- --crew=Midtown --commit   # apply
   ```
   Preview shows 8 stops moving to the next service day and `16/8 stops … OVER`. Then reload `/dispatch`. *Say:* "It previews before it touches anything, and it overrides capacity on purpose so you can watch the board reflow." The UI equivalent is **Rain day — all crews** on the board (`/dispatch/rain/<date>`), which pushes every crew at once. `--commit` mutates `groundwork_dev`; re-seed to reset.
5. **Skip → make-up offer.** Skip a stop from the crew view; the crew-day page offers **Book make-up** (looks 14 days ahead).
6. **Agreements & jobs — `/dispatch/agreements`, `/dispatch/jobs/new`.** Change an agreement's price; note past visits keep their snapshotted price. Add a call-in job onto a crew-day (fast path, two are seeded for today).
7. **Customer portal — `/portal`.** Sign in as `918-555-0101`. Service history, photos, cancel (preview then confirm), request a reschedule from an open calendar. Back on `/dispatch/reschedules`, approve or decline it. *Say:* "The portal shows price; the crew note is never sent to it."
8. **Invoicing — `/dispatch/invoices`.** Needs Stripe test keys in `.env` (`STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET`) and, in a second terminal, `stripe listen --forward-to localhost:3900/stripe/webhook`. Send → Checkout (card `4242 4242 4242 4242`, any future date/CVC, fill the ZIP) → the webhook flips the invoice to `paid`. Without keys, send refuses with "Stripe is not configured" — that's the honest failure, not a bug.
9. **Reports — `/dispatch/report`, `/dispatch/report/range`, `/dispatch/timesheet`.** Weekly owner report, quarter view, timesheet CSV. **Find a customer** on the board searches name, address and phone.

Pull the plug: `pkill -f "next dev -p 3900"`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "That link has expired or was already used" | 15-min, single-use. Request another; copy it from the dev terminal. |
| No `[notify]` line appears | You're reading the wrong terminal, or the address doesn't match a user/property (the form answers "sent" either way, by design). |
| `Database already has data` on seed | Add `-- --reset`. |
| Seed throws about local Postgres | `DATABASE_URL` must be `@localhost`. The seed refuses anything else. |
| Rain-day preview shows nothing to move | Weekends have no work; pass `--date=YYYY-MM-DD` for a weekday. |
| Board looks unchanged after `--commit` | Reload; the board polls but a stale tab may lag. |
| Port 3900 busy | `lsof -ti :3900` — another Groundwork server; kill it. |
| Invoice send: "Stripe is not configured" | Keys missing from `.env`; restart `npm run dev` after adding them. |

## What to concede before you're asked

- **Synthetic data, local only.** Nothing is deployed; there's no live URL.
- **SMS/email are a console log** unless Twilio/Resend are configured, and **nothing runs `npm run outbox:drain` on a schedule** — ad-hoc messages sit in the outbox.
- **Distances are straight-line** by default; real drive time needs an OSRM server.
- **Route reorder is ↑/↓, not drag** (the PRD says drag).
- **Horizon generation and agreement crew changes skip the capacity check.**
- **Timesheet has no "who completed this visit"** — visits record the crew, not the person.
- **The portal shows one property per customer**, and a declined reschedule can't be retried there.
- **Stripe was exercised in test mode only.** No live-mode keys, no refunds.
