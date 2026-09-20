# Groundwork

Field service routes and crews for a landscaping company: recurring service
agreements that generate their own visits, per-crew daily routes, a phone view
for crews, and one-action rain-day rescheduling.

> **Synthetic data only.** "Evergreen Property Care" is fictional. Route
> distances are straight-line estimates, never drive times.

```bash
npm install
createdb groundwork_dev && createdb groundwork_test && createdb groundwork_shadow
cp .env.example .env            # and a .env.test pointing at groundwork_test
npm run db:migrate:all
npm test
npm run visits:generate -- --date=2026-03-02
```

Then the demo:

```bash
npm run db:seed -- --reset    # 3 crews, 120 Tulsa properties, four weeks of visits
npm run dev                   # :3900 — pick "Dispatcher" or a crew (dev sign-in, no password)
npm run rain-day -- --crew=Midtown          # preview today's push
npm run rain-day -- --crew=Midtown --commit # apply it, then watch the board reflow
```

`/dispatch` is the weekly board (crews × days, coloured by load against
capacity); a cell opens that day's route, and "Rain day" previews the push
before committing it. `/crew/<id>` is the phone view.
