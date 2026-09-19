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
