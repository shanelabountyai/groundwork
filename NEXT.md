# Next

**Phase 4 — P0-6 reschedule cascade (rain day) + P0-7 weekly dispatch board** (`prd-groundwork-field-service.md`).

- Spec the cascade preview's states first (clean push / collision / overflow), per the PRD build notes. Commit is one transaction; failure-injection test proves no partial application.
- The cascade must null `routePosition` on every moved visit (decisions.md, Phase 2) and should run through the capacity check; the known gap (generation and agreement crew changes are not capacity-checked) gets revisited here.
- Outbox stub for affected-customer notifications.
- Board: crews × days, counts + estimated hours, colour by load vs capacity, polling refresh.
- Dispatcher UI is the second role: sign-in and the price split land here (Phase 3 left crews self-selecting at `/crew`). Uploaded photos are stored but not yet displayed; show them in the dispatcher's day view.
- Seed has no weekend stops and a light busiest day (3); the rain-week demo needs density.
